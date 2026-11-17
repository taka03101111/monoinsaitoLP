<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/mono-private/bootstrap.php';
$c=config();session_begin();
$method=$_SERVER['REQUEST_METHOD']??'GET';
$action=$_GET['action']??'';
if($method==='GET' && $action==='session'){
    $_SESSION['csrf']??=bin2hex(random_bytes(32));
    $id=bin2hex(random_bytes(16));
    $_SESSION['requests']??=[];
    foreach($_SESSION['requests'] as $key=>$at)if($at<time()-3600)unset($_SESSION['requests'][$key]);
    if(count($_SESSION['requests'])>=20)array_shift($_SESSION['requests']);
    $_SESSION['requests'][$id]=time();
    reply(200,['csrf'=>$_SESSION['csrf'],'requestId'=>$id,'expires'=>time()+3600]);
}
if($method==='GET' && $action==='receipt'){
    $kind=$_GET['kind']??'';
    if(!in_array($kind,['contact','download'],true))reply(400,['error'=>'受付の種類を確認してください。']);
    $row=lead($_SESSION['receipts'][$kind]??'');
    if(!$row)reply(404,['error'=>'受付情報を確認できません。フォームからお申し込みください。']);
    $data=['received'=>true,'receipt'=>$row['id'],'mailPending'=>!(bool)$row['reply_sent']];
    if($kind==='download')$data['downloadUrl']=pdf_url($row);
    reply(200,$data);
}
if($method!=='POST') {header('Allow: GET, POST');reply(405,['error'=>'操作を確認してください。']);}
if(($_SERVER['HTTP_ORIGIN']??'')!==$c['origin'])reply(403,['error'=>'元のフォームから送信してください。']);
if(!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json'))reply(415,['error'=>'送信形式を確認してください。']);
if((int)($_SERVER['CONTENT_LENGTH']??0)>32768)reply(413,['error'=>'入力内容が長すぎます。']);
$raw=file_get_contents('php://input',false,null,0,32769);
if(strlen($raw)>32768)reply(413,['error'=>'入力内容が長すぎます。']);
$input=json_decode($raw,true);
if(!is_array($input))reply(400,['error'=>'入力内容を確認してください。']);
foreach($input as $value)if(!is_string($value))reply(400,['error'=>'入力内容を確認してください。']);
if(!isset($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'],$input['csrf']??''))reply(403,['error'=>'受付の有効期限が切れました。ページを再読み込みしてください。']);
$request=$input['requestId']??'';$issued=$_SESSION['requests'][$request]??0;
if(!$issued || time()-$issued>3600)reply(403,['error'=>'受付の有効期限が切れました。ページを再読み込みしてください。']);
if(($input['website']??'')!=='' || time()-$issued<2)reply(422,['error'=>'少し時間をおいて、入力内容を確認してから送信してください。']);
$kind=$input['kind']??'';
if(!in_array($kind,['contact','download'],true))reply(422,['error'=>'フォームの種類を確認してください。']);
if(($input['consent']??'')!=='on')reply(422,['error'=>'プライバシーポリシーへの同意が必要です。']);
$limits=['company'=>120,'employees'=>30,'name'=>120,'email'=>254,'department'=>120,'type'=>15,'phone'=>120,'industry'=>120,'locations'=>5,'message'=>3000,'utm_source'=>160,'utm_medium'=>160,'utm_campaign'=>160,'utm_content'=>160,'utm_term'=>160];
$data=[];
foreach($limits as $field=>$max){
    $value=trim($input[$field]??'');
    if(preg_match('//u',$value)!==1 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$value))reply(422,['error'=>'使用できない文字が含まれています。']);
    preg_match_all('/./us',$value,$chars);
    if(count($chars[0])>$max || ($field!=='message'&&preg_match('/[\r\n]/',$value)))reply(422,['error'=>'入力内容の長さ・改行を確認してください。']);
    $data[$field]=$value;
}
foreach(['company','employees','name','email'] as $field)if($data[$field]==='')reply(422,['error'=>'必須項目を入力してください。']);
if(!filter_var($data['email'],FILTER_VALIDATE_EMAIL))reply(422,['error'=>'メールアドレスを確認してください。']);
if(!in_array($data['employees'],['1〜30名','31〜300名','301〜999名','1,000名以上'],true))reply(422,['error'=>'従業員数を選択してください。']);
if($kind==='contact'){
    if(!in_array($data['type'],['trial','demo','pricing','other'],true))reply(422,['error'=>'ご用件を選択してください。']);
    $digits=preg_replace('/\D/','',$data['phone']);
    if(!preg_match('/^[\d\s()+\-ー−]+$/u',$data['phone']) || strlen($digits)<8 || strlen($digits)>15)reply(422,['error'=>'電話番号を確認してください。']);
    if($data['locations']!==''&&!preg_match('/^[1-9][0-9]{0,4}$/',$data['locations']))reply(422,['error'=>'拠点数を確認してください。']);
}else{$data['type']='download';}
if($kind==='download'&&!is_file($c['pdf']))reply(503,['error'=>'資料の準備中です。時間をおいて再度お試しください。']);
$key=hash_hmac('sha256',session_id().':'.$request,$c['secret']);
$db=db();$db->exec('BEGIN IMMEDIATE');
try{
    $q=$db->prepare('SELECT * FROM leads WHERE request_key=?');$q->execute([$key]);$existing=$q->fetch(PDO::FETCH_ASSOC);
    if($existing){
        if($existing['kind']!==$kind)throw new RuntimeException('request kind');
        $id=$existing['id'];
    }else{
        $ip=hash_hmac('sha256',$_SERVER['REMOTE_ADDR']??'unknown',$c['secret']);
        $email=hash_hmac('sha256',strtolower($data['email']),$c['secret']);
        $q=$db->prepare('SELECT SUM(CASE WHEN created>? THEN 1 ELSE 0 END) AS total, SUM(CASE WHEN ip_hash=? AND created>? THEN 1 ELSE 0 END) AS ip, SUM(CASE WHEN email_hash=? AND created>? THEN 1 ELSE 0 END) AS email FROM leads WHERE created>?');
        $q->execute([time()-86400,$ip,time()-3600,$email,time()-3600,time()-86400]);$counts=$q->fetch(PDO::FETCH_ASSOC);
        if((int)$counts['total']>=$c['total_per_day'] || (int)$counts['ip']>=$c['ip_per_hour'] || (int)$counts['email']>=$c['email_per_hour']){
            $db->exec('ROLLBACK');header('Retry-After: 3600');reply(429,['error'=>'送信回数が上限に達しました。しばらく時間をおいて再度お試しください。']);
        }
        $id='MI-'.date('Ymd').'-'.strtoupper(bin2hex(random_bytes(8)));
        $q=$db->prepare('INSERT INTO leads(id,request_key,kind,created,ip_hash,email_hash,payload) VALUES(?,?,?,?,?,?,?)');
        $q->execute([$id,$key,$kind,time(),$ip,$email,json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
    }
    $db->exec('COMMIT');
}catch(Throwable $e){if($db->inTransaction())$db->exec('ROLLBACK');throw $e;}
$_SESSION['receipts'][$kind]=$id;
session_write_close();
// The durable receipt is the success boundary. Mail failures remain queued for cron.
try{deliver($id);}catch(Throwable $e){error_log('mono mail queued: '.get_class($e));}
reply(200,['received'=>true]);
