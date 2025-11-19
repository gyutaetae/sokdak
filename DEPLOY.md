# 오라클 클라우드 배포 가이드

## 준비물
- 오라클 클라우드 계정 (이미 있음 ✓)
- SSH 클라이언트 (Windows: PowerShell 또는 PuTTY)

## 1단계: Compute Instance 생성

### 1.1 인스턴스 생성
1. [오라클 클라우드 콘솔](https://cloud.oracle.com) 접속
2. 좌측 메뉴: **Compute** → **Instances** 클릭
3. **Create Instance** 버튼 클릭

### 1.2 기본 설정
- **Name**: secure-chat-server (원하는 이름)
- **Placement**: 기본값 유지

### 1.3 Image and Shape
- **Image**: Ubuntu 22.04
- **Shape**: VM.Standard.E2.1.Micro (Always Free 아이콘 확인)

### 1.4 Networking
- **VCN**: 기본 VCN 선택
- **Subnet**: Public Subnet 선택
- **Assign a public IPv4 address**: ✓ 체크 (중요!)

### 1.5 SSH Keys
- **Generate a key pair for me** 선택
- **Save Private Key** 버튼 클릭하여 다운로드 (중요!)
- 파일 이름: `ssh-key-XXXX.key`
- 안전한 곳에 보관하세요!

### 1.6 생성
- **Create** 버튼 클릭
- 1-2분 대기

### 1.7 Public IP 확인
- 인스턴스가 **Running** 상태가 되면
- **Public IP Address** 복사 (예: 132.145.XXX.XXX)

---

## 2단계: 방화벽 규칙 추가 (오라클 콘솔)

### 2.1 Security List 설정
1. 인스턴스 상세 페이지에서 **Primary VNIC** 클릭
2. **Subnet** 링크 클릭
3. **Security Lists** 섹션에서 보안 목록 클릭
4. **Add Ingress Rules** 버튼 클릭

### 2.2 규칙 추가
```
Source CIDR: 0.0.0.0/0
IP Protocol: TCP
Destination Port Range: 3000
Description: Secure Chat Server
```

5. **Add Ingress Rules** 클릭

---

## 3단계: SSH 접속 및 배포

### 3.1 SSH 키 권한 설정 (Windows)

PowerShell에서:

```powershell
# SSH 키 파일 경로로 이동
cd C:\Users\user\Downloads

# 파일 이름 확인 (예: ssh-key-2024-11-19.key)
icacls ssh-key-*.key /inheritance:r
icacls ssh-key-*.key /grant:r "$($env:USERNAME):(R)"
```

### 3.2 SSH 접속

```powershell
ssh -i ssh-key-*.key ubuntu@YOUR_PUBLIC_IP
```

예시:
```powershell
ssh -i ssh-key-2024-11-19.key ubuntu@132.145.XXX.XXX
```

처음 접속 시 "Are you sure you want to continue connecting?" 나오면 **yes** 입력

---

## 4단계: 프로젝트 배포

### 방법 A: GitHub 사용 (권장)

#### 1. GitHub에 프로젝트 업로드

로컬 컴퓨터에서:

```bash
cd C:\Users\user\Desktop\project

# Git 초기화
git init
git add .
git commit -m "Initial commit"

# GitHub에 레포지토리 생성 후
git remote add origin https://github.com/YOUR_USERNAME/secure-chat.git
git branch -M main
git push -u origin main
```

#### 2. 오라클 VM에서 클론

SSH 접속 후:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/secure-chat.git
cd secure-chat
bash deploy-oracle.sh
```

---

### 방법 B: 직접 파일 전송 (GitHub 없이)

#### 1. 프로젝트 압축 (로컬 컴퓨터)

```powershell
cd C:\Users\user\Desktop
Compress-Archive -Path project\* -DestinationPath secure-chat.zip
```

#### 2. SCP로 전송

```powershell
scp -i ssh-key-*.key secure-chat.zip ubuntu@YOUR_PUBLIC_IP:~
```

#### 3. VM에서 압축 해제 및 배포

```bash
cd ~
unzip secure-chat.zip -d secure-chat
cd secure-chat
bash deploy-oracle.sh
```

---

## 5단계: 배포 스크립트 실행

SSH 접속 상태에서:

```bash
cd ~/secure-chat
bash deploy-oracle.sh
```

스크립트가 자동으로 다음을 수행합니다:
- ✅ Node.js 설치
- ✅ PM2 설치
- ✅ 의존성 설치
- ✅ 서버 시작
- ✅ 방화벽 설정
- ✅ 자동 시작 설정

완료되면 접속 주소가 표시됩니다!

---

## 6단계: 접속 확인

### 브라우저에서 접속

```
http://YOUR_PUBLIC_IP:3000
```

예시:
```
http://132.145.XXX.XXX:3000
```

---

## 7단계 (선택): 무료 도메인 연결

### DuckDNS 사용

1. [DuckDNS](https://www.duckdns.org) 접속
2. GitHub/Google 계정으로 로그인
3. 원하는 서브도메인 입력 (예: `mysecurechat`)
4. **add domain** 클릭
5. 오라클 Public IP 입력

이제 접속 주소:
```
http://mysecurechat.duckdns.org:3000
```

---

## 8단계 (선택): SSL 인증서 (HTTPS)

### Nginx + Let's Encrypt

SSH 접속 후:

```bash
# Nginx 설치
sudo apt install -y nginx certbot python3-certbot-nginx

# Nginx 설정
sudo nano /etc/nginx/sites-available/secure-chat
```

다음 내용 입력:

```nginx
server {
    listen 80;
    server_name mysecurechat.duckdns.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

저장 (Ctrl+X, Y, Enter)

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/secure-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 방화벽에 HTTP/HTTPS 허용
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# SSL 인증서 발급
sudo certbot --nginx -d mysecurechat.duckdns.org
```

이메일 입력 후 진행하면 자동으로 HTTPS 설정 완료!

최종 접속 주소:
```
https://mysecurechat.duckdns.org
```

---

## 유용한 명령어

### PM2 관리

```bash
pm2 status          # 상태 확인
pm2 logs            # 로그 확인
pm2 restart all     # 재시작
pm2 stop all        # 중지
pm2 delete all      # 삭제
```

### 서버 업데이트

```bash
cd ~/secure-chat
git pull            # GitHub에서 최신 코드 가져오기
npm install         # 의존성 업데이트
pm2 restart all     # 재시작
```

---

## 트러블슈팅

### 포트 3000이 막혀있다면

```bash
# 방화벽 상태 확인
sudo ufw status

# 포트 확인
sudo netstat -tulpn | grep 3000

# iptables 확인
sudo iptables -L -n | grep 3000
```

### 로그 확인

```bash
# PM2 로그
pm2 logs

# 시스템 로그
sudo journalctl -u pm2-ubuntu
```

---

## 비용

- **VM**: 무료 (Always Free)
- **트래픽**: 월 10TB 무료
- **저장공간**: 100GB 무료
- **도메인**: DuckDNS 무료
- **SSL**: Let's Encrypt 무료

**총 비용: 0원!** 🎉

---

## 다음 단계

배포가 완료되면:

1. 휴대폰에서 `http://YOUR_IP:3000` 접속
2. 방 만들기
3. QR 코드 생성
4. 다른 휴대폰으로 QR 스캔하여 연결!

어디서든 사용 가능합니다! 🚀

