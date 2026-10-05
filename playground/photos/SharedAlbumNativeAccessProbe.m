// Research-only daemon status diagnostic. No account/album identifiers, Photos
// library reads, mutations, credential access, UI, or restricted entitlements.
// A callback proves delivery only; it does not prove album-management rights.
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

// Observe the diagnostic's outgoing contract in this process only. Forward the
// original call unchanged; do not synthesize replies or alter access checks.
struct ProbeBlock { void *isa; int flags; int reserved; void *invoke; void *descriptor; };
static NSString *blockSignature(id block) {
    struct ProbeBlock *b = (__bridge void *)block;
    if (!(b->flags & (1 << 30))) return @"unavailable";
    uintptr_t *descriptor = b->descriptor;
    descriptor += 2;
    if (b->flags & (1 << 25)) descriptor += 2;
    return [NSString stringWithUTF8String:*(const char **)descriptor] ?: @"unavailable";
}
static IMP originalSend;
static NSMutableDictionary *contract;
static void observeSend(id receiver, SEL selector, id message, id data, id handler) {
    NSString *signature = blockSignature(handler);
    contract[@"handlerEncoding"] = signature;
    if ([message isKindOfClass:[NSString class]]) contract[@"messageName"] = message;
    if ([message isKindOfClass:[NSNumber class]]) contract[@"messageCode"] = message;
    contract[@"dataClass"] = data ? NSStringFromClass([data class]) : @"nil";
    if ([signature isEqualToString:@"B32@?0i8@\"<NSCoding>\"12B20Q24"]) {
        BOOL (^original)(int, id, BOOL, unsigned long long) = handler;
        BOOL (^observed)(int, id, BOOL, unsigned long long) = ^BOOL(int code, id payload, BOOL flag, unsigned long long sequence) {
            contract[@"replyCode"] = @(code);
            contract[@"replyClass"] = payload ? NSStringFromClass([payload class]) : @"nil";
            if ([payload isKindOfClass:[NSError class]]) {
                contract[@"errorDomain"] = [payload domain];
                contract[@"errorCode"] = @([payload code]);
            }
            if ([payload isKindOfClass:[NSDictionary class]]) {
                contract[@"replyKeys"] = [[payload allKeys] sortedArrayUsingSelector:@selector(compare:)];
                id error = payload[@"error"];
                if ([error isKindOfClass:[NSError class]]) {
                    contract[@"errorDomain"] = [error domain];
                    contract[@"errorCode"] = @([error code]);
                }
            }
            return original(code, payload, flag, sequence);
        };
        ((void (*)(id, SEL, id, id, id))originalSend)(receiver, selector, message, data, observed);
        return;
    }
    ((void (*)(id, SEL, id, id, id))originalSend)(receiver, selector, message, data, handler);
}

int main(void) {
    @autoreleasepool {
        NSMutableDictionary *report = [@{
            @"schema": @1, @"processId": @(getpid()), @"serviceConstructed": @NO,
            @"statusRequestSent": @NO, @"callbackObserved": @NO,
            @"accountAccessPerformed": @NO, @"photoOperationsPerformed": @NO,
            @"managementAccessVerified": @NO, @"restrictedEntitlementsAdded": @NO
        } mutableCopy];
        contract = [NSMutableDictionary dictionary];
        @try {
            void *handle = dlopen("/System/Library/PrivateFrameworks/MediaStream.framework/MediaStream", RTLD_LAZY | RTLD_LOCAL);
            if (handle) {
                NSString *__unsafe_unretained *serviceName = (NSString *__unsafe_unretained *)dlsym(handle, "kMSASServiceName");
                if (serviceName && [*serviceName isKindOfClass:[NSString class]]) report[@"serviceName"] = *serviceName;
            }
            Class cls = NSClassFromString(@"MSASConnection");
            SEL factory = NSSelectorFromString(@"sharedConnection");
            SEL query = NSSelectorFromString(@"isInRetryStateHandler:");
            Method method = cls ? class_getInstanceMethod(cls, query) : NULL;
            Method create = cls ? class_getClassMethod(cls, factory) : NULL;
            const char *encoding = method ? method_getTypeEncoding(method) : NULL;
            const char *factoryEncoding = create ? method_getTypeEncoding(create) : NULL;
            if (!handle || !encoding || strcmp(encoding, "v24@0:8@?16") || !factoryEncoding || strcmp(factoryEncoding, "@16@0:8")) {
                report[@"status"] = @"native_contract_unavailable";
            } else {
                Class transport = NSClassFromString(@"XPCNSClientConnection");
                SEL sendSelector = NSSelectorFromString(@"sendMessage:data:withHandler:");
                Method send = class_getInstanceMethod(transport, sendSelector);
                if (send && !strcmp(method_getTypeEncoding(send), "v40@0:8@16@24@?32")) {
                    originalSend = method_setImplementation(send, (IMP)observeSend);
                }
                id connection = ((id (*)(id, SEL))objc_msgSend)(cls, factory);
                report[@"serviceConstructed"] = @(connection != nil);
                if (connection) {
                    dispatch_semaphore_t done = dispatch_semaphore_create(0);
                    // Intentionally inspect no callback arguments. The selector's
                    // block payload is undocumented; no result type is assumed.
                    void (^callback)(void) = ^{ dispatch_semaphore_signal(done); };
                    ((void (*)(id, SEL, id))objc_msgSend)(connection, query, callback);
                    report[@"statusRequestSent"] = @YES;
                    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow: 8];
                    BOOL observed = NO;
                    while ([deadline timeIntervalSinceNow] > 0) {
                        if (dispatch_semaphore_wait(done, DISPATCH_TIME_NOW) == 0) { observed = YES; break; }
                        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.025]];
                    }
                    report[@"callbackObserved"] = @(observed);
                    report[@"status"] = observed ? @"status_callback_observed" : @"status_callback_timeout";
                } else { report[@"status"] = @"native_service_unavailable"; }
            }
        } @catch (NSException *exception) {
            report[@"status"] = @"native_exception";
        }
        report[@"transportContract"] = contract;
        NSData *data = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:NULL];
        [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
        [[NSFileHandle fileHandleWithStandardOutput] writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
    }
    return 0;
}
