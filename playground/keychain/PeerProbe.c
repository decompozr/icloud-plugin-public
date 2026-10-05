/* Synthetic K0 connection identity probe. No Keychain API or credential path.
 * This socket experiment is NOT a production broker or per-message XPC proof.
 */
#include <Security/Security.h>
#include <mach/message.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <errno.h>
#include <signal.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef BUILD_LABEL
#define BUILD_LABEL "first"
#endif
static const char *build_label = BUILD_LABEL;

static int address(struct sockaddr_un *addr, const char *path) {
    memset(addr, 0, sizeof(*addr));
    addr->sun_family = AF_UNIX;
    if (strlen(path) >= sizeof(addr->sun_path)) return -1;
    strcpy(addr->sun_path, path);
    addr->sun_len = (unsigned char)SUN_LEN(addr);
    return 0;
}

#ifdef ROLE_BROKER
static const char *authorize(int peer, SecRequirementRef requirement) {
    audit_token_t token;
    socklen_t size = sizeof(token);
    if (getsockopt(peer, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &size) != 0 || size != sizeof(token)) return "token";
    CFDataRef data = CFDataCreate(NULL, (const UInt8 *)&token, sizeof(token));
    if (data == NULL) return "token";
    const void *keys[] = {kSecGuestAttributeAudit};
    const void *values[] = {data};
    CFDictionaryRef attributes = CFDictionaryCreate(NULL, keys, values, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    SecCodeRef code = NULL;
    OSStatus status = attributes == NULL ? errSecParam : SecCodeCopyGuestWithAttributes(NULL, attributes, kSecCSDefaultFlags, &code);
    if (attributes != NULL) CFRelease(attributes);
    CFRelease(data);
    if (status != errSecSuccess || code == NULL) return "code";
    status = SecCodeCheckValidity(code, kSecCSStrictValidate, requirement);
    CFRelease(code);
    return status == errSecSuccess ? "ok" : "requirement";
}
#endif

int main(int argc, char **argv) {
    signal(SIGPIPE, SIG_IGN);
    (void)build_label; /* build label is printed to bind changed-build evidence */
    if (argc == 2 && strcmp(argv[1], "--layout") == 0) {
        printf("{\"pointer\":%zu,\"message\":%zu,\"iov\":%zu,\"iov_pointer\":%zu,\"iov_count\":%zu,\"control_pointer\":%zu,\"control_length\":%zu,\"flags\":%zu,\"rights_space\":%zu,\"rights_data\":%zu,\"timeout\":%zu}\n",
            sizeof(void *), sizeof(struct msghdr), sizeof(struct iovec),
            offsetof(struct msghdr,msg_iov), offsetof(struct msghdr,msg_iovlen),
            offsetof(struct msghdr,msg_control), offsetof(struct msghdr,msg_controllen),
            offsetof(struct msghdr,msg_flags), (size_t)CMSG_SPACE(sizeof(int)), (size_t)CMSG_LEN(0), sizeof(struct timeval));
        return 0;
    }
#ifdef ROLE_BROKER
    if (argc != 3) return 64;
    CFStringRef text = CFStringCreateWithCString(NULL, argv[2], kCFStringEncodingUTF8);
    SecRequirementRef requirement = NULL;
    if (text == NULL || SecRequirementCreateWithString(text, kSecCSDefaultFlags, &requirement) != errSecSuccess) return 65;
    CFRelease(text);
#else
    if (argc != 3 && !(argc == 4 && (strcmp(argv[2], "delegate") == 0 || strcmp(argv[2], "delegate-race") == 0))) return 64;
#endif
    struct sockaddr_un addr;
    if (address(&addr, argv[1]) != 0) return 66;
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) return 67;
    struct timeval timeout = {.tv_sec = 3, .tv_usec = 0};
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
#ifdef ROLE_BROKER
    umask(0077);
    /* No unlink/replacement: an existing path fails closed. */
    if (bind(fd, (struct sockaddr *)&addr, addr.sun_len) != 0 || listen(fd, 8) != 0) return 68;
    puts("ready"); fflush(stdout);
    for (;;) {
        int peer = accept(fd, NULL, NULL);
        if (peer < 0) return 69;
        setsockopt(peer, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(peer, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        char message[128];
        ssize_t count = recv(peer, message, sizeof(message), 0);
        /* Deliberate deterministic interleaving: authenticate the first request
         * only after the approved donor writes a later byte on the shared FD.
         * This tests whether a socket token authenticates the original message.
         */
        if (count == 8 && memcmp(message, "deferred", 8) == 0) {
            if (send(peer, "held\n", 5, 0) != 5 || recv(peer, message, 1, 0) != 1 || message[0] != '!') { close(peer); continue; }
        }
        /* Payload PID/path/identity claims are ignored. No requested selectors.
         * Checking this connection does not secure delegated FDs or future sends.
         */
        const char *reason = count > 0 ? authorize(peer, requirement) : "request";
        char response[128];
        int length = snprintf(response, sizeof(response), "{\"result\":\"%s\",\"reason\":\"%s\"}\n", strcmp(reason,"ok") == 0 ? "allowed" : "denied", reason);
        if (send(peer, response, (size_t)length, 0) != length) { close(peer); continue; }
        close(peer);
    }
#else
    if (connect(fd, (struct sockaddr *)&addr, addr.sun_len) != 0) return 70;
    if (argc == 4) {
        /* Deliberately unsafe approved fixture exports its connected FD to a
         * same-user Bun process. Tests identity semantics, never credentials.
         */
        struct sockaddr_un transfer;
        if (address(&transfer, argv[3]) != 0) return 66;
        int control = socket(AF_UNIX, SOCK_STREAM, 0);
        if (control < 0 || connect(control, (struct sockaddr *)&transfer, transfer.sun_len) != 0) return 70;
        setsockopt(control, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        char rights[CMSG_SPACE(sizeof(int))] = {0}, marker = 'F';
        struct iovec vector = {.iov_base = &marker, .iov_len = 1};
        struct msghdr message = {.msg_iov = &vector, .msg_iovlen = 1, .msg_control = rights, .msg_controllen = sizeof(rights)};
        struct cmsghdr *header = CMSG_FIRSTHDR(&message);
        header->cmsg_level = SOL_SOCKET; header->cmsg_type = SCM_RIGHTS; header->cmsg_len = CMSG_LEN(sizeof(int));
        memcpy(CMSG_DATA(header), &fd, sizeof(fd));
        if (sendmsg(control, &message, 0) != 1) return 71;
        /* Keep the approved process alive until the recipient receives reply. */
        char acknowledgement;
        ssize_t count = recv(control, &acknowledgement, 1, 0);
        if (strcmp(argv[2], "delegate-race") == 0 && count == 1 && acknowledgement == 'K') {
            if (send(fd, "!", 1, 0) != 1) return 71;
            count = recv(control, &acknowledgement, 1, 0);
        }
        close(control); close(fd);
        return count == 1 && acknowledgement == 'D' ? 0 : 72;
    }
    char claim[128];
    int length = snprintf(claim, sizeof(claim), "claimed_pid=%s build=%s", argv[2], build_label);
    if (length < 0 || (size_t)length >= sizeof(claim) || send(fd, claim, (size_t)length, 0) != length) return 71;
    char response[128] = {0};
    ssize_t count = recv(fd, response, sizeof(response)-1, 0);
    close(fd);
    if (count <= 0) return 72;
    fputs(response, stdout);
    return strcmp(response,"{\"result\":\"allowed\",\"reason\":\"ok\"}\n") == 0 ? 0 : 77;
#endif
}
