# 오라클 프리티어 배포 가이드

## 1. 오라클 클라우드 인스턴스 생성

### 1.1 계정 생성
1. [Oracle Cloud Free Tier](https://www.oracle.com/kr/cloud/free/) 접속
2. 무료 계정 생성 (신용카드 필요, 무료 사용 시 요금 청구 없음)

### 1.2 VM 인스턴스 생성
1. Oracle Cloud 콘솔 로그인
2. **Compute** → **Instances** → **Create Instance**
3. 설정:
   - **Name**: phantom-chat
   - **Image**: Ubuntu 22.04
   - **Shape**: VM.Standard.E2.1.Micro (Always Free)
   - **Public IP**: 자동 할당
4. SSH 키 다운로드 (또는 기존 키 사용)
5. **Create** 클릭

### 1.3 방화벽 설정
1. **Virtual Cloud Network** → 생성된 VCN 선택
2. **Security Lists** → Default Security List 선택
3. **Add Ingress Rules** 클릭:
   - **Source CIDR**: 0.0.0.0/0
   - **Destination Port Range**: 3000
   - **Protocol**: TCP
   - **Description**: Phantom Chat
4. **Add Ingress Rule** 클릭

## 2. 서버 설정

### 2.1 SSH 접속
```bash
# Windows (PowerShell)
ssh -i "your-key.pem" ubuntu@YOUR_PUBLIC_IP

# 권한 오류 시
icacls "your-key.pem" /inheritance:r
icacls "your-key.pem" /grant:r "%username%:R"
```

### 2.2 시스템 업데이트
```bash
sudo apt update
sudo apt upgrade -y
```

### 2.3 Node.js 설치
```bash
# Node.js 18.x 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 설치 확인
node --version
npm --version
```

### 2.4 Git 설치
```bash
sudo apt install -y git
```

## 3. 애플리케이션 배포

### 3.1 프로젝트 클론
```bash
cd ~
git clone https://github.com/Gyu-kor/secure-chat.git
cd secure-chat
```

### 3.2 의존성 설치
```bash
npm install
```

### 3.3 PM2 설치 (프로세스 관리자)
```bash
sudo npm install -g pm2
```

### 3.4 애플리케이션 시작
```bash
# PM2로 앱 시작
pm2 start server.js --name phantom-chat

# 부팅 시 자동 시작 설정
pm2 startup
# 출력된 명령어를 복사해서 실행
pm2 save
```

### 3.5 Ubuntu 방화벽 설정
```bash
sudo ufw allow 3000
sudo ufw allow 22
sudo ufw enable
```

## 4. 접속 테스트

브라우저에서 `http://YOUR_PUBLIC_IP:3000` 접속

## 5. PM2 명령어

### 상태 확인
```bash
pm2 status
pm2 logs phantom-chat
pm2 monit
```

### 재시작/중지
```bash
pm2 restart phantom-chat
pm2 stop phantom-chat
pm2 delete phantom-chat
```

### 업데이트
```bash
cd ~/secure-chat
git pull
npm install
pm2 restart phantom-chat
```

## 6. 도메인 연결 (선택사항)

### 6.1 도메인 구입
- Cloudflare, GoDaddy, Namecheap 등에서 도메인 구입

### 6.2 DNS 설정
- A 레코드: YOUR_DOMAIN → YOUR_PUBLIC_IP

### 6.3 Nginx 설치
```bash
sudo apt install -y nginx
```

### 6.4 Nginx 설정
```bash
sudo nano /etc/nginx/sites-available/phantom-chat
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/phantom-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6.5 SSL 인증서 (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

### 6.6 방화벽 설정 업데이트
```bash
sudo ufw allow 80
sudo ufw allow 443
```

## 7. 모니터링

### 로그 확인
```bash
# PM2 로그
pm2 logs phantom-chat --lines 100

# Nginx 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 시스템 로그
sudo journalctl -u nginx -f
```

### 리소스 모니터링
```bash
# CPU/메모리 사용량
pm2 monit

# 시스템 리소스
htop
```

## 8. 보안 권장사항

### 8.1 SSH 보안 강화
```bash
sudo nano /etc/ssh/sshd_config
```

```
# 비밀번호 로그인 비활성화
PasswordAuthentication no

# 루트 로그인 비활성화
PermitRootLogin no
```

```bash
sudo systemctl restart sshd
```

### 8.2 Fail2Ban 설치
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 8.3 자동 업데이트
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 9. 백업

### 자동 백업 스크립트
```bash
nano ~/backup.sh
```

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

```bash
chmod +x ~/backup.sh

# Cron 설정 (매일 새벽 3시)
crontab -e
# 추가: 0 3 * * * ~/backup.sh
```

## 10. 문제 해결

### 포트가 이미 사용 중일 때
```bash
sudo lsof -i :3000
sudo kill -9 PID
```

### PM2 프로세스가 시작되지 않을 때
```bash
pm2 delete phantom-chat
pm2 start server.js --name phantom-chat
pm2 logs
```

### Nginx 502 오류
```bash
# 앱이 실행 중인지 확인
pm2 status

# Nginx 설정 확인
sudo nginx -t

# 로그 확인
sudo tail -f /var/log/nginx/error.log
```

### WebSocket 연결 실패
- Nginx 설정에 WebSocket 프록시 설정 확인
- 방화벽에서 포트 열림 확인
- 브라우저 콘솔에서 에러 확인

## 11. 성능 최적화

### Node.js 클러스터 모드
```bash
pm2 start server.js -i max --name phantom-chat
```

### Nginx 캐싱
```nginx
# /etc/nginx/sites-available/phantom-chat
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 12. 비용 관리

### Always Free 리소스
- VM.Standard.E2.1.Micro: 2개까지 무료
- 10GB 블록 스토리지
- 10TB 아웃바운드 데이터 전송/월

### 비용 초과 방지
- 항상 Free Tier 리소스만 사용
- 대시보드에서 비용 모니터링
- 예산 알림 설정

## 연락처

문제가 발생하면 GitHub Issues에 문의하세요.

