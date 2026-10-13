/** DEV only (/dev/crash): throws on render so the S16 error variant can be seen. */
export default function Crash(): never {
  throw new Error("Deliberate crash from /dev/crash");
}
