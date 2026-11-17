<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/mono-private/bootstrap.php';
$c=config();
if(!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD'],true))reply(405,['error'=>'操作を確認してください。']);
$id=$_GET['id']??'';$expires=$_GET['expires']??'';$sig=$_GET['sig']??'';
if(!is_string($id)||!is_string($expires)||!is_string($sig)||!preg_match('/^MI-[0-9]{8}-[A-F0-9]{16}$/',$id)||!ctype_digit($expires)||!preg_match('/^[a-f0-9]{64}$/',$sig))reply(403,['error'=>'有効な資料ダウンロードURLをご利用ください。']);
if((int)$expires<time()||!hash_equals(hash_hmac('sha256',$id.':'.$expires,$c['secret']),$sig))reply(403,['error'=>'URLが無効か、有効期限が切れています。資料フォームから再度お申し込みください。']);
$row=lead($id);
if(!$row || $row['kind']!=='download' || (int)$expires!==(int)$row['created']+7*86400)reply(403,['error'=>'受付情報を確認できません。']);
if(!is_file($c['pdf']))reply(503,['error'=>'資料の準備中です。']);
$pdfStream=@fopen($c['pdf'],'rb');
if($pdfStream===false)reply(503,['error'=>'資料の準備中です。']);
header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="mono-insight-guide.pdf"');
header('Content-Length: '.filesize($c['pdf']));header('Cache-Control: private, no-store');header('Referrer-Policy: no-referrer');header('X-Robots-Tag: noindex, nofollow');header('X-Content-Type-Options: nosniff');
if(($_SERVER['REQUEST_METHOD']??'GET')!=='HEAD')fpassthru($pdfStream);
fclose($pdfStream);
