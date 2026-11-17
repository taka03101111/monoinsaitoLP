<?php
declare(strict_types=1);
ini_set('display_errors', '0');
date_default_timezone_set('Asia/Tokyo');
function reply(int $status, array $data): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
set_exception_handler(function(Throwable $e): void {
    // Do not log user input, email addresses, signed links or secrets.
    error_log('mono form exception: '.get_class($e));
    reply(503,['error'=>'現在受付を完了できません。時間をおいて再度お試しいただくか、info@monoinsights.jp へご連絡ください。']);
});
function config(): array {
    static $config;
    if (isset($config)) return $config;
    $file=__DIR__.'/config.php';
    if (!is_file($file)) reply(503,['error'=>'フォームの受付準備中です。info@monoinsights.jp へご連絡ください。']);
    $config=require $file;
    if (!($config['enabled']??false) || strlen($config['secret']??'')<64) reply(503,['error'=>'フォームの受付準備中です。info@monoinsights.jp へご連絡ください。']);
    foreach (['from','recipient'] as $key) {
        if (!filter_var($config[$key]??'', FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/',$config[$key])) throw new RuntimeException('mail configuration');
    }
    $path=rtrim($config['data_dir'],'/\\');
    if (!is_dir($path) && !mkdir($path,0700,true)) throw new RuntimeException('private directory');
    return $config;
}
function db(): PDO {
    static $db;
    if(isset($db)) return $db;
    $c=config();
    $db=new PDO('sqlite:'.$c['data_dir'].'/forms.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000');
    $db->exec('CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL, ip_hash TEXT NOT NULL, email_hash TEXT NOT NULL, payload TEXT NOT NULL, notify_sent INTEGER DEFAULT 0, reply_sent INTEGER DEFAULT 0, notify_tries INTEGER DEFAULT 0, reply_tries INTEGER DEFAULT 0, next_try INTEGER DEFAULT 0)');
    return $db;
}
function session_begin(): void {
    $c=config();
    ini_set('session.use_strict_mode','1');
    ini_set('session.use_only_cookies','1');
    session_name('mono_form');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>str_starts_with($c['origin'],'https://'),'httponly'=>true,'samesite'=>'Lax']);
    session_start();
    header('Cache-Control: no-store, private');
}
function pdf_url(array $row): string {
    $c=config(); $expires=(int)$row['created']+7*86400;
    $signature=hash_hmac('sha256',$row['id'].':'.$expires,$c['secret']);
    return $c['origin'].'/api/download.php?id='.rawurlencode($row['id']).'&expires='.$expires.'&sig='.$signature;
}
function lead(string $id): array|false {
    $q=db()->prepare('SELECT * FROM leads WHERE id=?');$q->execute([$id]);return $q->fetch(PDO::FETCH_ASSOC);
}
function send_message(string $to,string $subject,string $body,string $replyTo): bool {
    $c=config();
    // Test spool is deliberately available only from loopback configurations.
    if (($c['transport']??'')==='test' && in_array(parse_url($c['origin'],PHP_URL_HOST),['127.0.0.1','localhost'],true)) {
        return file_put_contents($c['data_dir'].'/test-mail.jsonl',json_encode(compact('to','subject','body','replyTo'),JSON_UNESCAPED_UNICODE)."\n",FILE_APPEND|LOCK_EX)!==false;
    }
    if (($c['transport']??'')!=='mail') throw new RuntimeException('transport');
    $headers=['From'=>$c['from'],'Reply-To'=>$replyTo,'MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64'];
    // Only the fixed, validated server-side sender is used for envelope and From.
    return mail($to,'=?UTF-8?B?'.base64_encode($subject).'?=',chunk_split(base64_encode($body),76,"\r\n"),$headers,'-f'.escapeshellarg($c['from']));
}
function deliver(string $id): void {
    $c=config();
    $lock=fopen($c['data_dir'].'/mail.lock','c');
    if(!$lock || !flock($lock,LOCK_EX|LOCK_NB)) {if($lock)fclose($lock);return;}
    try {
        $row=lead($id); if(!$row || (int)$row['next_try']>time())return;
        $data=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);
        $title=$row['kind']==='download'?'資料ダウンロード':'お問い合わせ';
        $labels=['type'=>'ご用件','company'=>'会社名','employees'=>'従業員数','name'=>'お名前','email'=>'メールアドレス','phone'=>'電話番号','department'=>'部署・役職','industry'=>'業種','locations'=>'拠点数','message'=>'ご相談内容','utm_source'=>'流入元','utm_medium'=>'媒体','utm_campaign'=>'キャンペーン','utm_content'=>'コンテンツ','utm_term'=>'キーワード'];
        $body="monoインサイト {$title}\n受付番号：{$row['id']}\n\n";
        foreach($labels as $key=>$label)if(isset($data[$key])&&$data[$key]!=='')$body.=$label.'：'.$data[$key]."\n";
        $body.="\nプライバシーポリシーへの同意：取得済み\n";
        $reply="monoインサイトへの{$title}をありがとうございます。\n受付番号：{$row['id']}\n\n";
        $reply.=$row['kind']==='download'?"サービス紹介資料は、以下のURLからダウンロードできます（お申し込みから7日間有効）。\n".pdf_url($row)."\n":"担当者が内容を確認し、ご連絡いたします。\n";
        // Do not reflect arbitrary submitted text into auto-replies (spam relay prevention).
        $reply.="\nお心当たりがない場合は、このメールを破棄してください。\n株式会社オーテック / monoインサイト\ninfo@monoinsights.jp\n0568-78-5211\n";
        foreach(['notify','reply'] as $part){
            if((int)$row[$part.'_sent']===1 || (int)$row[$part.'_tries']>=5)continue;
            // Record attempts before transport. A process crash can still create rare duplicate mail; receipt is always unique.
            db()->prepare("UPDATE leads SET {$part}_tries={$part}_tries+1,next_try=? WHERE id=?")->execute([time()+300,$id]);
            $ok=$part==='notify'?send_message($c['recipient'],'【monoインサイト】'.$title.' '.$id,$body,$data['email']):send_message($data['email'],'【monoインサイト】'.$title.'を受け付けました',$reply,$c['from']);
            if($ok)db()->prepare("UPDATE leads SET {$part}_sent=1 WHERE id=?")->execute([$id]);
        }
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
