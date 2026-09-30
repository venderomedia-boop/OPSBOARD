FROM alpine:3.20
RUN apk add --no-cache restic openssh-client tzdata
COPY run-backups.sh /usr/local/bin/run-backups
RUN chmod +x /usr/local/bin/run-backups
ENTRYPOINT ["/usr/local/bin/run-backups"]
