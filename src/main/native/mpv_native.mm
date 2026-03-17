#include <node_api.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

/**
 * repositionMpvWindow(pid: number, x: number, y: number, width: number, height: number) → boolean
 *
 * Uses macOS Accessibility API to find mpv's window by PID and reposition/resize it.
 * Sets size first, then position, then position again to ensure accuracy
 * (mpv may adjust position after a size change).
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

            CGPoint pos = { (CGFloat)x, (CGFloat)y };
            CGSize size = { (CGFloat)width, (CGFloat)height };

            // Set size FIRST (mpv may reposition after resize)
            AXValueRef sizeVal = AXValueCreate(kAXValueTypeCGSize, &size);
            if (sizeVal) {
                AXUIElementSetAttributeValue(windowRef, kAXSizeAttribute, sizeVal);
                CFRelease(sizeVal);
            }

            // Set position AFTER size
            AXValueRef posVal = AXValueCreate(kAXValueTypeCGPoint, &pos);
            if (posVal) {
                AXUIElementSetAttributeValue(windowRef, kAXPositionAttribute, posVal);
                CFRelease(posVal);
            }

            // Set position AGAIN — mpv may have adjusted after size change
            AXValueRef posVal2 = AXValueCreate(kAXValueTypeCGPoint, &pos);
            if (posVal2) {
                AXUIElementSetAttributeValue(windowRef, kAXPositionAttribute, posVal2);
                CFRelease(posVal2);
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
 * getMpvWindowBounds(pid: number) → { x, y, width, height } | null
 *
 * Reads the current position and size of mpv's window.
 * Useful for debugging coordinate mismatches.
 */
static napi_value GetMpvWindowBounds(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 1) {
        napi_throw_error(env, NULL, "Expected 1 argument: pid");
        return NULL;
    }

    int32_t pid;
    napi_get_value_int32(env, args[0], &pid);

    @autoreleasepool {
        AXUIElementRef appRef = AXUIElementCreateApplication((pid_t)pid);
        if (!appRef) {
            napi_value null_val;
            napi_get_null(env, &null_val);
            return null_val;
        }

        CFArrayRef windows = NULL;
        AXError err = AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef*)&windows);

        if (err == kAXErrorSuccess && windows && CFArrayGetCount(windows) > 0) {
            AXUIElementRef windowRef = (AXUIElementRef)CFArrayGetValueAtIndex(windows, 0);

            CGPoint pos = { 0, 0 };
            CGSize size = { 0, 0 };

            AXValueRef posVal = NULL;
            AXValueRef sizeVal = NULL;

            AXUIElementCopyAttributeValue(windowRef, kAXPositionAttribute, (CFTypeRef*)&posVal);
            AXUIElementCopyAttributeValue(windowRef, kAXSizeAttribute, (CFTypeRef*)&sizeVal);

            if (posVal) {
                AXValueGetValue(posVal, kAXValueTypeCGPoint, &pos);
                CFRelease(posVal);
            }
            if (sizeVal) {
                AXValueGetValue(sizeVal, kAXValueTypeCGSize, &size);
                CFRelease(sizeVal);
            }

            if (windows) CFRelease(windows);
            CFRelease(appRef);

            napi_value obj;
            napi_create_object(env, &obj);

            napi_value vx, vy, vw, vh;
            napi_create_double(env, pos.x, &vx);
            napi_create_double(env, pos.y, &vy);
            napi_create_double(env, size.width, &vw);
            napi_create_double(env, size.height, &vh);

            napi_set_named_property(env, obj, "x", vx);
            napi_set_named_property(env, obj, "y", vy);
            napi_set_named_property(env, obj, "width", vw);
            napi_set_named_property(env, obj, "height", vh);

            return obj;
        }

        if (windows) CFRelease(windows);
        CFRelease(appRef);
    }

    napi_value null_val;
    napi_get_null(env, &null_val);
    return null_val;
}

/**
 * checkAccessibility() → boolean
 */
static napi_value CheckAccessibility(napi_env env, napi_callback_info info) {
    bool trusted = AXIsProcessTrusted();
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

/**
 * requestAccessibility() → void
 */
static napi_value RequestAccessibility(napi_env env, napi_callback_info info) {
    NSDictionary *options = @{ (__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES };
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return NULL;
}

/**
 * raiseMpvWindow(pid: number) → boolean
 */
static napi_value RaiseMpvWindow(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 1) {
        napi_throw_error(env, NULL, "Expected 1 argument: pid");
        return NULL;
    }

    int32_t pid;
    napi_get_value_int32(env, args[0], &pid);

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
            AXError raiseErr = AXUIElementPerformAction(windowRef, kAXRaiseAction);
            success = (raiseErr == kAXErrorSuccess);
        }

        if (windows) CFRelease(windows);
        CFRelease(appRef);
    }

    napi_get_boolean(env, success, &result);
    return result;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor props[] = {
        { "repositionMpvWindow", NULL, RepositionMpvWindow, NULL, NULL, NULL, napi_default, NULL },
        { "getMpvWindowBounds", NULL, GetMpvWindowBounds, NULL, NULL, NULL, napi_default, NULL },
        { "raiseMpvWindow", NULL, RaiseMpvWindow, NULL, NULL, NULL, napi_default, NULL },
        { "checkAccessibility", NULL, CheckAccessibility, NULL, NULL, NULL, napi_default, NULL },
        { "requestAccessibility", NULL, RequestAccessibility, NULL, NULL, NULL, napi_default, NULL },
    };
    napi_define_properties(env, exports, 5, props);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
