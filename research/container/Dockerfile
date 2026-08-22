# crucible-research：一次研究战役的信任边界。
# 烘焙一切（prime-agent、kernel venv、skills），运行时零安装、零外部依赖
# （除 DashScope 出站），PRIME_AGENT_KERNEL_PYTHON 钉死后 bootstrap 不再装任何东西。
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates procps python3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# prime agent（dist 自包含；node_modules 一并带走以保证扩展路径可用）
COPY prime-agent /opt/prime-agent

# crucible 五个 skill
COPY crucible-skills /opt/crucible-skills

# kernel venv：Python 3.11 + ipykernel + 默认 extras + runtime + 四个 python skill
RUN uv venv /opt/kernel-venv --python 3.11 \
    && uv pip install --python /opt/kernel-venv/bin/python \
       ipykernel dill requests httpx pyyaml tomli python-dotenv \
       pandas numpy scipy beautifulsoup4 lxml pydantic tyro \
    && uv pip install --python /opt/kernel-venv/bin/python /opt/prime-agent/prime-agent-runtime \
    && uv pip install --python /opt/kernel-venv/bin/python \
       -e /opt/crucible-skills/register \
       -e /opt/crucible-skills/probe \
       -e /opt/crucible-skills/grill \
       -e /opt/crucible-skills/figure

# prime 配置：apiKey 只写环境变量名，值由运行时注入，密钥永不进镜像
RUN mkdir -p /root/.prime/agent
COPY prime-config/models.json /root/.prime/agent/models.json
COPY prime-config/settings.json /root/.prime/agent/settings.json

ENV PRIME_AGENT_KERNEL_PYTHON=/opt/kernel-venv/bin/python \
    CRUCIBLE_RUN_DIR=/work/artifacts \
    CRUCIBLE_CASE_DIR=/work/case \
    CRUCIBLE_WORKTREE_ROOT=/work/worktrees \
    PYTHONUNBUFFERED=1

WORKDIR /work
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
