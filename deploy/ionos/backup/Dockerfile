FROM alpine:3.20
RUN apk add --no-cache restic openssh-client tzdata postgresql-client sqlite && mkdir -p /root/.ssh && chmod 700 /root/.ssh
COPY run-backups.sh /usr/local/bin/run-backups
COPY verify-restore.sh /usr/local/bin/verify-restore
RUN chmod +x /usr/local/bin/run-backups /usr/local/bin/verify-restore
ENTRYPOINT ["/usr/local/bin/run-backups"]
