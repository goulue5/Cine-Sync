#include <node_api.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

/**
 * repositionMpvWindow(pid: number, x: number, y: number, width: number, height: number) → boolean
 *
 * Uses macOS Accessibility API to find mpv's window by PID and reposition/resize it.
 * Much faster than osascript (runs in-process, no shell spawn).
 * Requires Accessibility permissions.
 */
static napi_value RepositionMpvWindow(napi_env env, napi_callback_info info) {
    size_t argc = 5;
    napi_value args[5];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 5) {
        napi_throw_error(env, NULL, "Expected 5 arguments: pid, x, y, width, height");
        return NULL;
    }

    int32_t pid;
    double x, y, width, height;
    napi_get_value_int32(env, args[0], &pid);
    napi_get_value_double(env, args[1], &x);
    napi_get_value_double(env, args[2], &y);
    napi_get_value_double(env, args[3], &width);
    napi_get_value_double(env, args[4], &height);

    napi_value result;
    bool success = false;

    @autoreleasepool {
        AXUIElementRef appRef = AXUIElementCreateApplication((pid_t)pid);
        if (!appRef) {
            napi_get_boolean(env, false, &result);
            return result;
        }

        CFArrayRef windows = NULL;
        AXError err = AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef*)&windows);

        if (err == kAXErrorSuccess && windows && CFArrayGetCount(windows) > 0) {
            AXUIElementRef windowRef = (AXUIElementRef)CFArrayGetValueAtIndex(windows, 0);

            // Set position
            CGPoint pos = { (CGFloat)x, (CGFloat)y };
            AXValueRef posVal = AXValueCreate(kAXValueTypeCGPoint, &pos);
            if (posVal) {
                AXUIElementSetAttributeValue(windowRef, kAXPositionAttribute, posVal);
                CFRelease(posVal);
            }

            // Set size
            CGSize size = { (CGFloat)width, (CGFloat)height };
            AXValueRef sizeVal = AXValueCreate(kAXValueTypeCGSize, &size);
            if (sizeVal) {
                AXUIElementSetAttributeValue(windowRef, kAXSizeAttribute, sizeVal);
                CFRelease(sizeVal);
            }

            success = true;
        }

        if (windows) CFRelease(windows);
        CFRelease(appRef);
    }

    napi_get_boolean(env, success, &result);
    return result;
}

/**
 * checkAccessibility() → boolean
 *
 * Returns true if the app has Accessibility permissions (needed for window positioning).
 */
static napi_value CheckAccessibility(napi_env env, napi_callback_info info) {
    bool trusted = AXIsProcessTrusted();
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

/**
 * requestAccessibility() → void
 *
 * Opens the System Settings Accessibility pane and prompts for permission.
 */
static napi_value RequestAccessibility(napi_env env, napi_callback_info info) {
    NSDictionary *options = @{ (__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES };
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return NULL;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor props[] = {
        { "repositionMpvWindow", NULL, RepositionMpvWindow, NULL, NULL, NULL, napi_default, NULL },
        { "checkAccessibility", NULL, CheckAccessibility, NULL, NULL, NULL, napi_default, NULL },
        { "requestAccessibility", NULL, RequestAccessibility, NULL, NULL, NULL, napi_default, NULL },
    };
    napi_define_properties(env, exports, 3, props);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
