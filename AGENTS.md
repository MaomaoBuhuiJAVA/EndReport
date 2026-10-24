# Production Deployment

- The active production application source is `robot-console/` in this repository.
- The deployment target is Alibaba Cloud ECS running Ubuntu, Node.js 22, Nginx, and the `guoke-web` systemd service.
- The application listens on `127.0.0.1:3000`; PostgreSQL runs on ECS and media is stored in Alibaba Cloud OSS.
- Verify production state using the current ECS deployment records and checks against SSH, systemd, Nginx, and the public HTTP endpoints.
- Treat other workspace copies, temporary directories, and archived snapshots as historical material, not as production source or deployment status.
