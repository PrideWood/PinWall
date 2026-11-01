export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function appOrigin() {
  return new URL(required("APP_URL")).origin;
}
export function ownerEmail() {
  return required("OWNER_EMAIL").toLowerCase();
}
