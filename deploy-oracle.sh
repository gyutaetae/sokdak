#!/bin/bash

# 오라클 클라우드 배포 스크립트
echo "🚀 Secure Chat 오라클 배포 시작..."

# 시스템 업데이트
echo "📦 시스템 업데이트 중..."
sudo apt update
sudo apt upgrade -y

# Node.js 설치 (v20 LTS)
echo "📦 Node.js 설치 중..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Git 설치 (필요한 경우)
sudo apt install -y git

# PM2 설치 (프로세스 관리)
echo "📦 PM2 설치 중..."
sudo npm install -g pm2

# 프로젝트 디렉토리로 이동
cd ~/secure-chat

# 의존성 설치
echo "📦 의존성 설치 중..."
npm install

# PM2로 앱 시작
echo "🚀 앱 시작 중..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 방화벽 설정
echo "🔥 방화벽 설정 중..."
sudo ufw allow 3000/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

# 오라클 iptables 설정
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

echo ""
echo "✅ 배포 완료!"
echo ""
echo "📱 접속 주소:"
echo "   http://$(curl -s ifconfig.me):3000"
echo ""
echo "🔧 유용한 명령어:"
echo "   pm2 logs       - 로그 확인"
echo "   pm2 restart all - 재시작"
echo "   pm2 stop all   - 중지"
echo ""

