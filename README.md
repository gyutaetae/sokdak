# Secure Chat - P2P Encrypted Messaging

WebRTC 기반의 종단간 암호화(E2EE) P2P 채팅 애플리케이션입니다. 세션이 종료되면 모든 대화 내용이 자동으로 삭제되어 프라이버시를 보호합니다.

## 주요 기능

- **종단간 암호화 (E2EE)**: WebRTC의 DTLS/SRTP 기본 암호화 사용
- **P2P 직접 연결**: 서버를 거치지 않는 직접 데이터 전송 (DataChannel)
- **자동 삭제 타이머**: 메시지별로 5초~1분 자동 삭제 설정 가능
- **세션 기반**: 서버 메모리에만 임시 저장, DB 저장 없음
- **QR 코드 공유**: 쉬운 방 초대 기능
- **이미지 전송**: 텍스트 + 이미지 전송 지원
- **그룹 채팅**: 1:1 및 다대다 채팅 지원
- **세션 자동 소멸**: 사용자가 나가면 3초 후 대화창 자동 닫힘

## 기술 스택

### 백엔드
- Node.js
- Express
- Socket.io (시그널링 서버)

### 프론트엔드
- 순수 HTML/CSS/JavaScript
- WebRTC (RTCPeerConnection, DataChannel)
- Socket.io Client
- QRCode.js (QR 코드 생성)
- jsQR (QR 코드 스캔)

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

또는

```bash
npm start
```

### 3. 브라우저에서 접속

```
http://localhost:3000
```

## 프로젝트 구조

```
project/
├── server.js              # Node.js + Socket.io 시그널링 서버
├── package.json
├── README.md
└── public/
    ├── index.html         # 메인 페이지 (방 생성/입장)
    ├── room.html          # 채팅방 페이지
    ├── style.css          # 스타일시트
    └── client.js          # WebRTC + Socket.io 클라이언트 로직
```

## WebRTC P2P 연결 프로세스

1. **사용자 A**: 방 생성 → 시그널링 서버에 접속 → room-123 생성
2. **웹 앱**: room-123 URL이 담긴 QR 코드 생성
3. **사용자 B**: QR 스캔 → 시그널링 서버에 room-123 접속 요청
4. **시그널링 서버**: 두 사용자 모두 접속 확인
5. **WebRTC 프로세스 시작**:
   - A가 자신의 연결 정보(offer) 생성 → 서버 → B 전달
   - B가 offer를 받고 P2P 연결 정보(answer) 생성 → 서버 → A 전달
   - 두 사람은 네트워크 경로 정보(ICE candidates)를 찾아 서버를 통해 계속 교환
6. **RTCPeerConnection 연결 완료**
7. **RTCDataChannel 개방**
8. **P2P 직접 통신**: 이제 메시지는 시그널링 서버를 거치지 않고 직접 전송됨

## 세션 기반 소멸 메커니즘

1. **세션 생성**: 방 생성 시 서버 메모리에만 저장
2. **메시지 중계**: 메시지는 RAM에서 중계되고 즉시 삭제 (DB 저장 없음)
3. **세션 소멸**: 
   - 사용자가 브라우저를 닫으면 Socket.io의 `disconnect` 이벤트 감지
   - 서버는 해당 방을 메모리에서 삭제
   - 다른 사용자에게 "상대방이 나갔음"을 알림
   - 3초 후 채팅창 자동 비활성화

## 배포 가이드

### Glitch 배포

1. [Glitch](https://glitch.com)에 가입
2. New Project → Import from GitHub
3. 이 레포지토리 URL 입력
4. 자동으로 무료 서브도메인 제공 (예: `your-project.glitch.me`)

### 오라클 프리티어 배포 (권장)

#### 장점
- Always Free VM 제공 (24시간 구동)
- Glitch보다 안정적이고 제한 없음
- 더 나은 성능

#### 배포 단계

1. **오라클 클라우드 가입**
   - [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) 가입
   - 신용카드 필요 (Free Tier 사용 시 요금 청구 없음)

2. **Compute Instance 생성**
   - Compute → Instances → Create Instance
   - Image: Ubuntu 22.04
   - Shape: VM.Standard.E2.1.Micro (Always Free)
   - Public IP 할당

3. **방화벽 설정**
   - Virtual Cloud Network → Security Lists
   - Ingress Rules 추가:
     - Source: 0.0.0.0/0
     - Destination Port: 3000
     - Protocol: TCP

4. **SSH 접속 및 서버 설정**

```bash
# SSH 접속
ssh ubuntu@<YOUR_PUBLIC_IP>

# Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 프로젝트 클론
git clone <YOUR_REPO_URL>
cd project

# 의존성 설치
npm install

# PM2 설치 (프로세스 관리)
sudo npm install -g pm2

# 앱 시작
pm2 start server.js --name secure-chat

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save

# 방화벽 열기 (Ubuntu)
sudo ufw allow 3000
sudo ufw enable
```

5. **환경 변수 설정 (선택사항)**

```bash
# .env 파일 생성
nano .env
```

```env
PORT=3000
NODE_ENV=production
```

6. **접속**
   - http://YOUR_PUBLIC_IP:3000

7. **도메인 연결 (선택사항)**
   - 도메인 구입 후 A 레코드를 Public IP로 설정
   - Nginx 리버스 프록시 + Let's Encrypt SSL 인증서 설정

### Nginx + SSL 설정 (선택사항)

```bash
# Nginx 설치
sudo apt update
sudo apt install nginx

# Nginx 설정
sudo nano /etc/nginx/sites-available/secure-chat
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
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/secure-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Let's Encrypt SSL 인증서
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 보안 고려사항

1. **암호화**: WebRTC는 기본적으로 DTLS/SRTP 암호화 사용
2. **데이터 저장**: 서버는 메시지를 저장하지 않음 (메모리에만 임시 보관)
3. **P2P 직접 연결**: 메시지가 서버를 거치지 않음 (DataChannel 사용 시)
4. **STUN/TURN**: 
   - 현재는 공개 STUN 서버만 사용
   - NAT 통과 실패 시를 대비해 TURN 서버 추가 권장 (비용 발생)

## TURN 서버 추가 (선택사항)

NAT 통과가 어려운 환경에서는 TURN 서버가 필요할 수 있습니다.

### coturn 설치 (자체 호스팅)

```bash
sudo apt install coturn

# 설정
sudo nano /etc/turnserver.conf
```

```conf
listening-port=3478
fingerprint
lt-cred-mech
user=username:password
realm=your-domain.com
```

### client.js에 TURN 서버 추가

```javascript
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { 
            urls: 'turn:your-domain.com:3478',
            username: 'username',
            credential: 'password'
        }
    ]
};
```

## 트러블슈팅

### P2P 연결이 안 될 때

1. 브라우저 콘솔에서 에러 확인
2. STUN/TURN 서버 응답 확인
3. 방화벽 설정 확인
4. NAT 타입 확인 (Symmetric NAT는 TURN 필요)

### Socket.io 연결 실패

1. 서버가 실행 중인지 확인
2. 방화벽에서 포트가 열려있는지 확인
3. CORS 설정 확인

### 메시지가 전송되지 않을 때

1. DataChannel 상태 확인 (`readyState === 'open'`)
2. P2P 연결 실패 시 Socket.io 백업 경로로 전송됨
3. 네트워크 탭에서 WebSocket 연결 확인

## 라이선스

MIT License

## 기여

Pull Request 환영합니다!

## 연락처

문의사항이 있으시면 이슈를 생성해주세요.



