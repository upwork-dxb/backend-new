const CLOUDFLARE_PROVIDER = "cloudflare";

const CLOUDFLARE_CONFIG = {
  enabled: false,
  provider: CLOUDFLARE_PROVIDER,
  CLOUDFLARE: CLOUDFLARE_PROVIDER,
  credentials: {
    account_id: "",
    account_hash: "",
    token: ""
  },
  endpoints: {
    base_url(account_id) {
      return `https://api.cloudflare.com/client/v4/accounts/${account_id}/images/v1`;
    },
    upload_image: "uploadImage",
    remove_image: "removeImage"
  }
};

module.exports = Object.freeze(CLOUDFLARE_CONFIG);
