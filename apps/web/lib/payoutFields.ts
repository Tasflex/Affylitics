export type Field = { key: string; label: string; hint?: string; type?: "tel" | "email" | "text"; autoComplete?: string };

const PHONE: Field = { key: "phone", label: "Mobile money number", hint: "Include your country code, e.g. +254 712 345 678", type: "tel", autoComplete: "tel" };
const EMAIL: Field = { key: "email", label: "Account email", type: "email", autoComplete: "email" };
const BANK: Field[] = [
  { key: "account_number", label: "Account number" },
  { key: "bank_code", label: "Bank code", hint: "Your bank's code, sort code or routing number" },
];

const BY_RAIL: Record<string, Field[]> = {
  paypal: [{ ...EMAIL, label: "PayPal email" }],
  payoneer: [{ ...EMAIL, label: "Payoneer email" }],
  upi: [{ key: "upi_id", label: "UPI ID", hint: "e.g. name@okbank" }],
  pix: [{ key: "pix_key", label: "PIX key", hint: "CPF, email, phone or random key" }],
  spei: [{ key: "account_number", label: "CLABE (18 digits)" }],
  sepa: [{ key: "iban", label: "IBAN" }, { key: "account_holder", label: "Account holder name", autoComplete: "name" }],
  usdc: [{ key: "wallet_address", label: "USDC wallet address", hint: "On Base or Polygon. Double-check it: crypto transfers cannot be reversed." }],
  swift: [{ key: "iban", label: "IBAN or account number" }, { key: "bank_code", label: "SWIFT / BIC code" }, { key: "account_holder", label: "Account holder name" }],
};

export function fieldsFor(railId: string, kind: string): Field[] {
  if (BY_RAIL[railId]) return BY_RAIL[railId];
  if (kind === "mobile_money" || kind === "wallet") return [PHONE];
  return BANK;
}
