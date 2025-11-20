# Phantom Chat 배포 가이드 (한국어)

## 목차
1. [무료 도메인 옵션](#1-무료-도메인-옵션)
2. [오라클 클라우드 설정](#2-오라클-클라우드-설정)
3. [서버 접속 및 설정](#3-서버-접속-및-설정)
4. [도메인 연결](#4-도메인-연결)
5. [Nginx + SSL 설정](#5-nginx--ssl-설정-https)
6. [유지보수](#6-유지보수)

---

## 1. 무료 도메인 옵션

### 옵션 1: 무료 서브도메인 서비스 (완전 무료!)

**Freenom (추천!)**
- 웹사이트: https://www.freenom.com
- 무료 도메인: `.tk`, `.ml`, `.ga`, `.cf`, `.gq`
- 예시: `phantomchat.tk`, `secretchat.ml`
- 갱신: 매년 무료 갱신 가능
- 제한: 상업적 용도는 권장하지 않음

**사용 방법:**
1. Freenom 접속 및 회원가입
2. 원하는 도메인 검색 (예: phantomchat)
3. `.tk`, `.ml` 등 무료 확장자 선택
4. "Get it now" 클릭
5. 12개월 무료 선택
6. 결제 없이 등록 완료

**DNS 설정:**
1. My Domains → Manage Domain
2. Management Tools → Nameservers
3. Use custom nameservers 선택
4. Cloudflare nameserver 입력 (선택사항)

---

### 옵션 2: Cloudflare Pages/Workers (완전 무료!)

**특징:**
- 무료 서브도메인: `your-app.pages.dev`
- 무료 SSL 포함
- CDN 무료
- 제한: 프로젝트를 Cloudflare에 배포해야 함

**사용 방법:**
1. https://pages.cloudflare.com 접속
2. GitHub 연동
3. 프로젝트 배포
4. 자동으로 `*.pages.dev` 도메인 제공

---

### 옵션 3: DuckDNS (완전 무료!)

**특징:**
- 웹사이트: https://www.duckdns.org
- 무료 서브도메인: `your-name.duckdns.org`
- 갱신: 30일마다 자동 갱신 (무료)
- 장점: 간단하고 빠름

**사용 방법:**
1. DuckDNS 접속
2. GitHub/Twitter로 로그인
3. 서브도메인 입력 (예: phantomchat)
4. IP 주소 입력 (오라클 Public IP)
5. Add domain 클릭
6. 완료! `phantomchat.duckdns.org` 사용 가능

---

### 옵션 4: No-IP (무료 + 30일 갱신)

**특징:**
- 웹사이트: https://www.noip.com
- 무료 서브도메인: 여러 선택지 제공
- 갱신: 30일마다 이메일로 갱신 링크 (클릭만 하면 됨)

---

### 옵션 5: 유료 도메인 (가장 전문적)

**가격 비교:**

| 서비스 | 가격 (.com) | 특징 |
|--------|-------------|------|
| **Cloudflare** | $9/년 | 무료 SSL, CDN |
| **Namecheap** | $11/년 | 첫 해 할인 |
| **가비아** | 15,000원/년 | 한국 서비스 |
| **GoDaddy** | $15/년 | 유명함 |

**추천: Cloudflare Registrar**
- 가장 저렴
- 숨은 비용 없음
- 무료 SSL, CDN

---

## 2. 오라클 클라우드 설정

### 2.1 현재 인스턴스 문제 해결

**⚠️ 중요: Public IP가 없습니다!**

**해결 방법 1: Reserved Public IP 할당**

```bash
Oracle Cloud Console 접속
→ Networking
→ IP Management
→ Reserved Public IPs
→ "Create Reserved Public IP" 클릭
→ Compartment 선택: zn7034 (root)
→ "Create" 클릭
→ 생성된 IP 클릭
→ "..." 메뉴 → "Assign to Private IP"
→ 인스턴스의 Primary VNIC 선택
→ "Assign" 클릭
```

**해결 방법 2: 인스턴스 재생성 (더 쉬움)**

```bash
1. 현재 인스턴스 Terminate
2. Create Instance 클릭
3. 설정:
   - Name: phantom-chat
   - Image: Ubuntu 22.04
   - Shape: VM.Standard.E2.1.Micro (Always Free)
   - Networking:
     ✅ Assign a public IPv4 address: YES (중요!)
   - SSH Keys: 기존 키 사용
4. Create 클릭
```

---

### 2.2 방화벽 규칙 추가

```bash
Oracle Cloud Console
→ Networking
→ Virtual Cloud Networks
→ vcn-20251120-2306 클릭
→ Security Lists
→ Default Security List 클릭
→ Add Ingress Rules

규칙 1 (앱):
- Source CIDR: 0.0.0.0/0
- Destination Port: 3000
- Description: Phantom Chat

규칙 2 (HTTP):
- Source CIDR: 0.0.0.0/0
- Destination Port: 80
- Description: HTTP

규칙 3 (HTTPS):
- Source CIDR: 0.0.0.0/0
- Destination Port: 443
- Description: HTTPS
```

---

## 3. 서버 접속 및 설정

### 3.1 SSH 접속 (Windows)

**PowerShell 사용:**

```powershell
# SSH 키 경로
$keyPath = "C:\Users\kym70\OneDrive\Desktop\ssh-key-2025-11-20.key"

# 권한 설정 (처음 한 번만)
icacls $keyPath /inheritance:r
icacls $keyPath /grant:r "$env:USERNAME`:R"

# SSH 접속 (YOUR_PUBLIC_IP를 실제 IP로 교체)
ssh -i $keyPath ubuntu@YOUR_PUBLIC_IP
```

**SSH 키가 `.pub` 파일만 있는 경우:**
```powershell
# .pub 확장자 제거
$oldPath = "C:\Users\kym70\OneDrive\Desktop\ssh-key-2025-11-20.key (2).pub"
$newPath = "C:\Users\kym70\OneDrive\Desktop\ssh-key-2025-11-20.key"
Rename-Item $oldPath $newPath
```

---

### 3.2 서버 설정 (한 번에 복사/붙여넣기)

**자동 설치 스크립트:**

```bash
#!/bin/bash
# Phantom Chat 자동 설치 스크립트

echo "===== 시스템 업데이트 ====="
sudo apt update && sudo apt upgrade -y

echo "===== Node.js 18.x 설치 ====="
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "===== Git 설치 ====="
sudo apt install -y git

echo "===== 프로젝트 클론 ====="
cd ~
git clone https://github.com/Gyu-kor/secure-chat.git
cd secure-chat

echo "===== 의존성 설치 ====="
npm install

echo "===== PM2 설치 ====="
sudo npm install -g pm2

echo "===== 앱 시작 ====="
pm2 start server.js --name phantom-chat

echo "===== 부팅 시 자동 시작 설정 ====="
pm2 startup
pm2 save

echo "===== 방화벽 설정 ====="
sudo ufw allow 3000
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

echo "===== 완료! ====="
echo "브라우저에서 http://$(curl -s ifconfig.me):3000 접속하세요"
```

**사용 방법:**
```bash
# 스크립트 생성
nano install.sh

# 위 내용 복사/붙여넣기
# Ctrl+X → Y → Enter

# 실행 권한 부여
chmod +x install.sh

# 실행
./install.sh
```

**또는 한 줄씩 실행:**

```bash
# 1. 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 2. Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Git 설치
sudo apt install -y git

# 4. 프로젝트 클론
cd ~
git clone https://github.com/Gyu-kor/secure-chat.git
cd secure-chat

# 5. 의존성 설치
npm install

# 6. PM2 설치
sudo npm install -g pm2

# 7. 앱 시작
pm2 start server.js --name phantom-chat

# 8. 자동 시작 설정
pm2 startup
# 출력된 명령어를 복사해서 실행
pm2 save

# 9. 방화벽 설정
sudo ufw allow 3000
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

### 3.3 테스트

**브라우저에서 접속:**
```
http://YOUR_PUBLIC_IP:3000
```

**서버 상태 확인:**
```bash
pm2 status
pm2 logs phantom-chat
```

---

## 4. 도메인 연결

### 4.1 Freenom 무료 도메인 (추천!)

**1단계: 도메인 등록**
```
1. https://www.freenom.com 접속
2. 회원가입/로그인
3. 도메인 검색: phantomchat
4. .tk 또는 .ml 선택 (무료)
5. "Get it now" → "Checkout"
6. Period: 12 Months @ FREE
7. Continue → 완료!
```

**2단계: DNS 설정**
```
My Domains → Manage Domain → Management Tools → Nameservers

옵션 A (직접 설정):
- Use default nameservers 선택
- Manage Freenom DNS → Add Record
  - Type: A
  - Name: (비워두기 또는 @)
  - Target: YOUR_PUBLIC_IP
  - TTL: 14400

옵션 B (Cloudflare 사용 - 추천):
- Use custom nameservers 선택
- Nameserver 1: ava.ns.cloudflare.com
- Nameserver 2: brad.ns.cloudflare.com
- Save Changes
```

---

### 4.2 DuckDNS 무료 서브도메인

**1단계: 도메인 등록**
```
1. https://www.duckdns.org 접속
2. GitHub/Google로 로그인
3. Sub Domain 입력: phantomchat
4. Current IP: YOUR_PUBLIC_IP 입력
5. "add domain" 클릭
```

**2단계: 자동 업데이트 (선택사항)**
```bash
# IP가 변경될 때마다 자동 업데이트
echo "curl 'https://www.duckdns.org/update?domains=phantomchat&token=YOUR_TOKEN&ip=' >/dev/null 2>&1" > ~/duckdns.sh
chmod +x ~/duckdns.sh

# Cron 설정 (5분마다 확인)
crontab -e
# 추가: */5 * * * * ~/duckdns.sh >/dev/null 2>&1
```

**결과:**
```
도메인: phantomchat.duckdns.org
접속: http://phantomchat.duckdns.org:3000
```

---

### 4.3 유료 도메인 (Cloudflare)

**1단계: 도메인 구매**
```
1. https://www.cloudflare.com/products/registrar/ 접속
2. 계정 생성
3. 도메인 검색 및 구매 ($9~12/년)
```

**2단계: DNS 설정**
```
Cloudflare Dashboard
→ DNS
→ Add record

레코드 1:
- Type: A
- Name: @ (또는 루트)
- IPv4 address: YOUR_PUBLIC_IP
- Proxy status: DNS only (회색)
- TTL: Auto

레코드 2:
- Type: A
- Name: www
- IPv4 address: YOUR_PUBLIC_IP
- Proxy status: DNS only (회색)
- TTL: Auto
```

---

## 5. Nginx + SSL 설정 (HTTPS)

### 5.1 Nginx 설치

```bash
sudo apt install -y nginx
```

---

### 5.2 Nginx 설정

**설정 파일 생성:**
```bash
sudo nano /etc/nginx/sites-available/phantom-chat
```

**내용 (도메인을 실제 도메인으로 변경):**
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # 파일 업로드 크기 제한
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket 지원
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # 헤더 설정
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        
        # 타임아웃 설정 (대용량 파일)
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

**예시 (DuckDNS 사용 시):**
```nginx
server {
    listen 80;
    server_name phantomchat.duckdns.org;
    
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### 5.3 Nginx 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/phantom-chat /etc/nginx/sites-enabled/

# 기본 설정 제거 (선택사항)
sudo rm /etc/nginx/sites-enabled/default

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# 상태 확인
sudo systemctl status nginx
```

**테스트:**
```
http://your-domain.com
```

---

### 5.4 Let's Encrypt SSL 인증서 (무료 HTTPS)

**Certbot 설치:**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

**SSL 인증서 발급:**
```bash
# 도메인을 실제 도메인으로 변경
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# DuckDNS 예시:
sudo certbot --nginx -d phantomchat.duckdns.org
```

**대화형 프롬프트:**
```
1. 이메일 입력 (복구용)
2. (A)gree 입력
3. (Y)es 또는 (N)o 선택 (이메일 수신)
4. 자동으로 설정 완료!
```

**자동 갱신 테스트:**
```bash
sudo certbot renew --dry-run
```

**결과:**
```
✅ HTTP: http://your-domain.com
✅ HTTPS: https://your-domain.com (자동 리다이렉트)
```

---

### 5.5 방화벽 최종 확인

```bash
sudo ufw status

# 출력 예시:
# 22/tcp    ALLOW    Anywhere
# 80/tcp    ALLOW    Anywhere
# 443/tcp   ALLOW    Anywhere
# 3000/tcp  ALLOW    Anywhere
```

---

## 6. 유지보수

### 6.1 PM2 명령어

**상태 확인:**
```bash
pm2 status
pm2 logs phantom-chat
pm2 logs phantom-chat --lines 100
pm2 monit
```

**재시작/중지:**
```bash
pm2 restart phantom-chat
pm2 stop phantom-chat
pm2 delete phantom-chat
```

**자동 시작 재설정:**
```bash
pm2 unstartup
pm2 startup
pm2 save
```

---

### 6.2 코드 업데이트

**서버에서 업데이트:**
```bash
cd ~/secure-chat
git pull
npm install
pm2 restart phantom-chat
```

**로컬에서 푸시:**
```bash
cd c:\Users\kym70\1\secure-chat
git add .
git commit -m "Update features"
git push
```

---

### 6.3 로그 확인

**PM2 로그:**
```bash
pm2 logs phantom-chat --lines 100
```

**Nginx 로그:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**시스템 로그:**
```bash
sudo journalctl -u nginx -f
```

---

### 6.4 백업

**자동 백업 스크립트:**
```bash
nano ~/backup.sh
```

**내용:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups
mkdir -p $BACKUP_DIR

# 프로젝트 백업
tar -czf $BACKUP_DIR/phantom-chat-$DATE.tar.gz ~/secure-chat

# 오래된 백업 삭제 (30일 이상)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: phantom-chat-$DATE.tar.gz"
```

**실행 권한 및 Cron 설정:**
```bash
chmod +x ~/backup.sh

# Cron 설정 (매일 새벽 3시)
crontab -e
# 추가: 0 3 * * * ~/backup.sh
```

---

## 7. 문제 해결

### 7.1 서버 접속 안 됨

**증상:** `http://IP:3000` 접속 불가

**해결:**
```bash
# 1. 앱 실행 확인
pm2 status

# 2. 포트 확인
sudo lsof -i :3000

# 3. 방화벽 확인
sudo ufw status

# 4. 로그 확인
pm2 logs phantom-chat
```

---

### 7.2 도메인 접속 안 됨

**증상:** 도메인으로 접속 불가

**해결:**
```bash
# 1. DNS 전파 확인 (최대 24시간 소요)
nslookup your-domain.com

# 2. Nginx 상태 확인
sudo systemctl status nginx

# 3. Nginx 설정 확인
sudo nginx -t

# 4. 로그 확인
sudo tail -f /var/log/nginx/error.log
```

---

### 7.3 HTTPS 오류

**증상:** SSL 인증서 오류

**해결:**
```bash
# 1. 인증서 확인
sudo certbot certificates

# 2. 강제 갱신
sudo certbot renew --force-renewal

# 3. Nginx 재시작
sudo systemctl restart nginx
```

---

### 7.4 비디오 전송 실패

**증상:** 비디오가 전송되지 않음

**해결:**
```bash
# 1. 버퍼 크기 확인 (server.js)
# maxHttpBufferSize: 50e6 확인

# 2. Nginx 업로드 제한 확인
sudo nano /etc/nginx/sites-available/phantom-chat
# client_max_body_size 50M; 확인

# 3. Nginx 재시작
sudo systemctl restart nginx
```

---

## 8. 비용 정리

### 완전 무료 옵션

| 항목 | 비용 | 서비스 |
|------|------|--------|
| 서버 | **무료** | 오라클 프리티어 |
| 도메인 | **무료** | Freenom / DuckDNS |
| SSL | **무료** | Let's Encrypt |
| **총 비용** | **무료!** | - |

### 유료 도메인 옵션

| 항목 | 비용 | 서비스 |
|------|------|--------|
| 서버 | **무료** | 오라클 프리티어 |
| 도메인 | $9~15/년 | Cloudflare |
| SSL | **무료** | Let's Encrypt |
| **총 비용** | **$9~15/년** | - |

---

## 9. 체크리스트

### 배포 전
- [ ] GitHub에 코드 푸시 완료
- [ ] 오라클 클라우드 계정 생성
- [ ] SSH 키 다운로드

### 서버 설정
- [ ] Public IP 할당 완료
- [ ] 방화벽 규칙 추가 (3000, 80, 443)
- [ ] SSH 접속 성공
- [ ] Node.js, Git, PM2 설치 완료
- [ ] 앱 실행 확인 (http://IP:3000)

### 도메인 설정
- [ ] 도메인 등록 (Freenom/DuckDNS/유료)
- [ ] DNS A 레코드 설정
- [ ] DNS 전파 확인 (최대 24시간)

### HTTPS 설정
- [ ] Nginx 설치 및 설정
- [ ] Let's Encrypt SSL 인증서 발급
- [ ] https:// 접속 테스트

### 최종 테스트
- [ ] PC에서 https://도메인 접속
- [ ] 휴대폰에서 접속
- [ ] 방 생성 및 QR 코드 테스트
- [ ] 메시지, 이미지, 비디오 전송 테스트
- [ ] 자동 삭제 타이머 테스트

---

## 10. 추천 워크플로우

**1일차: 서버 설정 (30분~1시간)**
```
1. Public IP 할당
2. SSH 접속
3. 자동 설치 스크립트 실행
4. http://IP:3000 테스트
```

**2일차: 도메인 설정 (10~30분)**
```
1. Freenom 또는 DuckDNS 도메인 등록
2. DNS A 레코드 설정
3. DNS 전파 대기 (1~24시간)
```

**3일차: HTTPS 설정 (20분)**
```
1. Nginx 설치 및 설정
2. Let's Encrypt SSL 발급
3. https://도메인 테스트
```

**완료!**
```
✅ https://phantomchat.tk
✅ 완전 무료
✅ HTTPS 지원
✅ 모바일 지원
```

---

## 11. 다음 단계

**선택 사항:**

1. **Google Analytics 추가**
   - 사용자 통계 확인

2. **Cloudflare CDN 활성화**
   - 속도 향상
   - DDoS 방어

3. **모니터링 추가**
   - UptimeRobot (무료)
   - 서버 다운 시 알림

4. **사용자 피드백 수집**
   - Google Forms
   - 개선사항 반영

---

## 12. 문의

문제가 발생하면 GitHub Issues에 문의하세요:
https://github.com/Gyu-kor/secure-chat/issues

---

**마지막 업데이트:** 2024-11-20
**버전:** 1.0
**저자:** Phantom Chat Team

