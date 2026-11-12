import type { OrganizationSeed, PartnerSeed } from "./definitions";

/**
 * One-time initial configuration data for principal/.
 *
 * Edit this file with the organization and partner identity before applying the
 * bootstrap. Passwords are never stored here: applying requires
 * BOOTSTRAP_PARTNER_ACCOUNT_PASSWORD in the environment. --dry-run does not
 * require it because it never writes. The technical account has no password.
 *
 * The values below are MVP seed defaults, not production identity. Replace
 * them before the apply run.
 */

export interface SeedAccountIdentity {
  email: string;
  display_name: string;
}

export interface InitialSeed {
  organization: OrganizationSeed;
  service_account: SeedAccountIdentity;
  partner: PartnerSeed;
  partner_account: SeedAccountIdentity;
}

export const INITIAL_SEED: InitialSeed = {
  organization: {
    name: "VERLA",
    legal_name: "VERLA S.A.S.",
    tax_id: "901000000-0",
    contact_email: "contacto@verla.example",
    phone: null,
  },
  service_account: {
    email: "automation@verla.example",
    display_name: "Automatización VERLA",
  },
  partner: {
    name: "Aliado Demo",
    legal_name: "Aliado Demo S.A.S.",
    document_type: "NIT",
    document_number: "901000001-0",
    contact_name: "Contacto Aliado Demo",
    contact_email: "contacto@aliado.example",
    phone: "3000000000",
    address: null,
    contract_reference: null,
  },
  partner_account: {
    email: "acceso@aliado.example",
    display_name: "Aliado Demo",
  },
};
