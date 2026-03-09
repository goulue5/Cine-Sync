export interface DisplayInfo {
  widthPx: number
  heightPx: number
  scaleFactor: number
  refreshRate: number
  colorSpace: string
  colorDepth: number
  depthPerComponent: number
}

export function buildQualityFlags(display: DisplayInfo, platform: NodeJS.Platform): string[] {
  const flags: string[] = []

  // ── Video output + GPU API ──────────────────────────────────────────────
  if (platform === 'darwin') {
    flags.push('--vo=gpu-next', '--gpu-api=auto')
  } else if (platform === 'win32') {
    flags.push('--vo=gpu', '--gpu-api=d3d11')
  } else {
    flags.push('--vo=gpu', '--gpu-api=auto')
  }

  // ── Scaling (based on physical pixel width) ─────────────────────────────
  if (display.widthPx >= 2560) {
    flags.push('--scale=ewa_lanczossharp', '--dscale=mitchell', '--cscale=ewa_lanczossharp')
  } else {
    flags.push('--scale=spline36', '--dscale=mitchell', '--cscale=spline36')
  }

  // ── Debanding (always) ──────────────────────────────────────────────────
  flags.push(
    '--deband',
    '--deband-iterations=4',
    '--deband-threshold=35',
    '--deband-range=16',
    '--deband-grain=5',
  )

  // ── Video sync + interpolation ──────────────────────────────────────────
  if (display.refreshRate >= 120) {
    flags.push('--video-sync=display-resample', '--interpolation', '--tscale=oversample')
  } else if (display.refreshRate > 0) {
    flags.push('--video-sync=display-resample')
  }

  // ── Color management ────────────────────────────────────────────────────
  flags.push('--icc-profile-auto')

  const wideGamut =
    /P3|Rec\.\s*2020|BT\.?\s*2020/i.test(display.colorSpace) ||
    display.depthPerComponent >= 10

  if (wideGamut) {
    flags.push('--target-colorspace-hint=yes')
  }

  // ── HDR ─────────────────────────────────────────────────────────────────
  const hdr = wideGamut && display.depthPerComponent >= 10
  if (hdr) {
    flags.push('--tone-mapping=auto', '--hdr-compute-peak')
  } else {
    flags.push('--tone-mapping=auto')
  }

  // ── Dithering + deinterlace (always) ────────────────────────────────────
  flags.push('--dither-depth=auto', '--deinterlace=auto')

  return flags
}
