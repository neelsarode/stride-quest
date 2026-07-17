import ExpoModulesCore

// Registers the <PixelCrisp> native view (see PixelCrispView). No props/events —
// it's a pure pass-through container that crisps its RN <Image> descendants.
public class PixelCrispModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PixelCrisp")
    View(PixelCrispView.self) {}
  }
}
