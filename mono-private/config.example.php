<?php
// Copy to config.php OUTSIDE public_html. Do not commit a configured copy.
return [
    'enabled' => false, // Enable only after Xserver mail / DNS / cron tests.
    'origin' => 'https://monoinsights.jp',
    'secret' => '', // Generate: php -r "echo bin2hex(random_bytes(32));"
    'recipient' => 'info@monoinsights.jp',
    'from' => 'info@monoinsights.jp',
    'transport' => 'mail', // Xserver PHP mail; test SPF/DKIM/DMARC in delivered headers.
    'data_dir' => __DIR__ . '/data',
    'pdf' => __DIR__ . '/guide.pdf',
    'retention_days' => 30, // Proposed retention for form records; confirm with client.
    'ip_per_hour' => 20,
    'email_per_hour' => 5,
    'total_per_day' => 500,
];
