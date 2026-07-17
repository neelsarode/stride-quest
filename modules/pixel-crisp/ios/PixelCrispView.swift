import ExpoModulesCore
import UIKit

// A pass-through container whose only job is crisp pixel art: it forces
// nearest-neighbor magnification (and minification) on its entire layer subtree,
// so RN <Image> children upscale WITHOUT iOS's default bilinear smoothing.
//
// The scale that magnifies a sprite lives on an ANCESTOR transform (the fighter
// wrapper's displayHeight scale); Core Animation samples each layer's `contents`
// with THAT layer's filter at the effective on-screen scale (no rasterization by
// default), so setting `.nearest` on the image's own layer crisps it even though
// the enlarging transform is higher up.
//
// Reapplied on layout / subview-add (+ one deferred pass) so it survives the
// async image decode and RN view recycling — the filter is a layer property that
// persists once set, independent of when `contents` arrive.
final class PixelCrispView: ExpoView {
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
  }

  private func applyNearest(_ layer: CALayer) {
    layer.magnificationFilter = .nearest
    layer.minificationFilter = .nearest
    layer.sublayers?.forEach { applyNearest($0) }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    applyNearest(layer)
  }

  override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    applyNearest(subview.layer)
    // Catch any sublayer/contents the RN image view attaches during its async
    // decode, a beat after mount.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
      self?.applyNearest(subview.layer)
    }
  }
}
