module.exports = Object.freeze({
  enabled: false,
  CLOUDFLARE: "cloudflare",
  provider: "cloudflare",
  cloudflare: {
    account_id: "",
    account_hash: "",
    token: "",
    url: "https://api.cloudflare.com/client/v4/accounts/account_id/images/v1",
    upload_image: "uploadImage",
    remove_image: "removeImage"
  }
});