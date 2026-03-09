{
  "targets": [
    {
      "target_name": "mpv_native",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["src/main/native/mpv_native.mm"],
          "link_settings": {
            "libraries": ["-framework Cocoa", "-framework ApplicationServices"]
          },
          "xcode_settings": {
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "OTHER_CFLAGS": ["-fobjc-arc"]
          }
        }]
      ]
    }
  ]
}
