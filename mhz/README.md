# MHz Web v0.1

> 不是播放你喜欢的歌，而是找到你的下一首喜欢。

MHz 是一个极简私人音乐电台。当前 PoC 使用 Audius 的真实独立音乐和浏览器 HTML5 Audio，验证连续播放与行为驱动的私人推荐闭环。它不是歌单或搜索型音乐 App。

## Audius 真实播放 PoC

Audius 当前公开 Trending、搜索和 Stream 接口无需用户登录或付费密钥。配置：

```env
MUSIC_PROVIDER=audius
AUDIUS_APP_NAME=MHz
```

随后运行：

```bash
cp .env.example .env
docker compose up --build
```

打开 <http://localhost:3000>，点击 `START LISTENING`。后端从 Audius Trending 导入真实候选歌曲，前端通过官方 `/v1/tracks/{id}/stream` 地址播放，不下载、不代理、不做离线缓存。

## 结构

- `frontend/`：Next.js、TypeScript、TailwindCSS、Zustand、HTML5 Audio
- `backend/`：FastAPI、SQLAlchemy 2 async、Alembic、规则推荐
- PostgreSQL：歌曲、Provider 映射、频道和行为
- Redis：为下一阶段候选缓存预留

业务 Track UUID 与 Audius Track ID 始终分离，Provider ID 只保存在 `track_providers`。

## 快速启动（Mock）

```bash
docker compose up --build
```

打开 <http://localhost:3000>，点击 `START LISTENING`，可测试切台、播放/暂停、Favorite、Skip、Dislike、预取和自动下一首。

Mock 模式使用安全的 Compose 默认值，无需先创建 `.env`。要改配置时再执行 `cp .env.example .env`。

健康检查：<http://localhost:8000/health>；API 文档：<http://localhost:8000/docs>。

## 本地开发

后端（Python 3.12）：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

前端（Node.js 20）：

```bash
cd frontend
npm install
npm run dev
```

## Apple Music 配置

1. 在 Apple Developer 创建 Media/MusicKit Identifier 和 MusicKit 私钥。
2. 将 `.p8` 放在服务端安全位置，绝不能放进前端或提交 Git。
3. 设置 `.env`：

```env
MUSIC_PROVIDER=apple
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_PRIVATE_KEY_PATH=/run/secrets/AuthKey_xxx.p8
APPLE_MUSIC_STOREFRONT=cn
APPLE_MUSIC_ORIGIN=http://localhost:3000
```

后端签发并缓存 ES256 Developer Token，浏览器通过 `/api/v1/apple/developer-token` 获取它，然后由 MusicKit 管理用户授权。Apple 模式首次连接会从 Catalog 导入候选歌曲，再进入推荐播放。

生产环境应把 `.p8` 作为容器 secret 只挂载给 backend，并把 `APPLE_MUSIC_ORIGIN` 改成精确的 HTTPS Origin。

## Migration 和测试

```bash
make migrate
make test
make lint
make build
```

推荐测试覆盖：favorite affinity、dislike 过滤、最近歌曲过滤、Artist 防重复、skip penalty 和 fallback。

## API

- `POST /api/v1/users/anonymous`
- `GET /api/v1/channels`
- `GET /api/v1/tracks/search?q=Radiohead`
- `POST /api/v1/tracks/discover?limit=100`
- `POST /api/v1/recommendations/next`
- `POST /api/v1/events`
- `GET /api/v1/apple/developer-token`
- `GET /api/v1/analytics/discovery`

## 当前边界

v0.1 推荐是可解释的规则模型，不包含协同过滤或神经网络。Analytics 是第一版实时聚合口径；有足够行为数据后再增加严格的“首次曝光”物化指标、Item CF 和离线评估。
