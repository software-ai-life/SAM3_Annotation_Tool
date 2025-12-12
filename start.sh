#!/bin/bash

# 啟動前端（使用 preview 模式，不需要 watch）
cd /app/frontend
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 5766 &

# 啟動後端（關閉 reload 避免 watch 過多檔案）
cd /app/backend
uvicorn app.main:app --host 0.0.0.0 --port 5341
