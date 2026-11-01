import { chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { createAuth } from "../server/auth.js";
import { db } from "../server/db.js";
import { appOrigin, ownerEmail } from "../server/config.js";
import { hashToken } from "../server/phone.js";
try {
  let { rows } = await db().query(
    'SELECT id FROM "user" WHERE lower(email)=$1',
    [ownerEmail()],
  );
  if (!rows[0]) {
    // A random unused password bootstraps the account; interactive login uses phone approval only.
    await createAuth(true).api.signUpEmail({
      body: {
        email: ownerEmail(),
        password: randomBytes(48).toString("base64url"),
        name: "Owner",
      },
    });
    ({ rows } = await db().query(
      'SELECT id FROM "user" WHERE lower(email)=$1',
      [ownerEmail()],
    ));
  }
  const token = randomBytes(32).toString("hex");
  await db().query("DELETE FROM phone_pairings WHERE owner_id=$1", [
    rows[0].id,
  ]);
  await db().query(
    "INSERT INTO phone_pairings(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [hashToken(token), rows[0].id],
  );
  const url = `${appOrigin()}/phone#pair=${token}`;
  const outputIndex=process.argv.indexOf("--qr-file");
  if(outputIndex!==-1){
    const path=process.argv[outputIndex+1];
    if(!path)throw new Error("--qr-file requires a local output path");
    await QRCode.toFile(path,url,{width:480,margin:3,errorCorrectionLevel:"M"});
    await chmod(path,0o600);
    console.log("一次性手机绑定二维码已生成，10 分钟内有效。仅用你自己的手机扫描。");
  }else{
    console.log("用你自己的手机扫描下方二维码，然后点击“绑定这部手机”。链接 10 分钟有效，只能使用一次。不要把此链接发给他人。");
    if(!appOrigin().startsWith("https:")) console.log("当前为本地地址。手机绑定需先部署到 HTTPS 域名，并更新 APP_URL 后重新生成。");
    console.log(await QRCode.toString(url,{type:"terminal",small:true}));
    console.log(url);
  }
} finally { await db().end(); }
