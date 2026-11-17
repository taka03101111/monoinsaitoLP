<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
$c=config();$db=db();
$q=$db->prepare('SELECT id FROM leads WHERE next_try<=? AND ((notify_sent=0 AND notify_tries<5) OR (reply_sent=0 AND reply_tries<5)) ORDER BY created LIMIT 50');
$q->execute([time()]);$ids=$q->fetchAll(PDO::FETCH_COLUMN);$q->closeCursor();
foreach($ids as $id){try{deliver($id);}catch(Throwable $e){error_log('mono mail retry: '.get_class($e));}}
$q=$db->query('SELECT COUNT(*) FROM leads WHERE (notify_sent=0 AND notify_tries>=5) OR (reply_sent=0 AND reply_tries>=5)');
$failed=(int)$q->fetchColumn();
if($failed>0)fwrite(STDERR,"mono: {$failed} receipt(s) require mail delivery review.\n");
// Proposed retention: records are deleted after 30 days. Confirm and configure before launch.
$db->prepare('DELETE FROM leads WHERE created<?')->execute([time()-max(8,(int)$c['retention_days'])*86400]);
echo "mono forms: queue checked; retention applied.\n";
