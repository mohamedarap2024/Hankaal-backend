/** Official Hankaal College contact & payment defaults (backend) */
export const SITE_CONTACT = {
  email: "hankaalcollege@gmail.com",
  phone: "+252 61 4422002",
  phoneDial: "614422002",
  whatsappUrl: "https://wa.me/252614422002",
  ussdPrefix: "*712*614422002*",
  ussdSuffix: "#",
  facebookUrl: "https://www.facebook.com/share/18kuRdujZS/",
  siteName: "Hankaal College",
  siteTagline: "Practice · Patience · Progress",
  siteDescription:
    "Online English classes for Somali-speaking students worldwide. Based in Mogadishu, Somalia.",
} as const;

export const DEFAULT_SITE_SETTINGS: Record<string, string> = {
  logo_url: "/hankaal-logo.png",
  hero_image_url:
    "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1280&auto=format&fit=crop",
  whatsapp_url: SITE_CONTACT.whatsappUrl,
  payment_ussd_prefix: SITE_CONTACT.ussdPrefix,
  payment_ussd_suffix: SITE_CONTACT.ussdSuffix,
  site_name: SITE_CONTACT.siteName,
  site_tagline: SITE_CONTACT.siteTagline,
  contact_email: SITE_CONTACT.email,
  contact_phone: SITE_CONTACT.phone,
  facebook_url: SITE_CONTACT.facebookUrl,
};
