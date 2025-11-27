#!/bin/bash

# 간단한 배포 스크립트 (서버에서 실행)
echo "🔄 업데이트 시작..."

cd ~/secure-chat

# 변경사항 가져오기
echo "📥 Git pull 중..."
git pull origin main

# 의존성 업데이트 (필요한 경우)
echo "📦 의존성 확인 중..."
npm install

# PM2 재시작
echo "🔄 서버 재시작 중..."
pm2 restart secure-chat

echo "✅ 배포 완료!"
pm2 logs secure-chat --lines 10

