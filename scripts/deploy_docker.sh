#!/usr/bin/env bash
# pm2 stop all
source /root/.bashrc
cd /home/aquar-home
git pull
docker-compose stop
cd /home/aquar-home
DOCKER_BUILDKIT=0 docker image build --no-cache -t ld0574/aquarhome:latest .
docker images
cmd=$1
if [ "$cmd" == "push" ]; then
    # docker tag 2f3890615562 ld0574/aquarhome:1.1.9
    docker login --username=ld0574 -p $DOCKER_HUB_ACCESS_TOKEN
    docker push ld0574/aquarhome:latest
    echo "最新镜像已推送至docker hub"
fi
cd /home/aquar-home
docker-compose up -d
