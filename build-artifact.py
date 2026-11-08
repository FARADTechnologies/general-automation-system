# Turns dist-single/index.html into an Artifact page body (no doctype/html/head/body tags).
import re, sys
html = open('dist-single/index.html', encoding='utf-8').read()
head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>|<meta name="(apple-mobile-web-app-capable|mobile-web-app-capable)"[^>]*>', '', head)
title = re.search(r'<title>.*?</title>', head).group(0)
head = head.replace(title, '')
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Onest:wght@400;500;600;700&display=swap">'
out = title + '\n' + fonts + '\n' + head + '\n' + body
open(sys.argv[1], 'w', encoding='utf-8').write(out)
print(len(out))
