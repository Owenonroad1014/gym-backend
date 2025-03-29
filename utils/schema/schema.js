import { z } from "zod";

export const rgSchema = z
  .object({
    email: z
      .string()
      .min(1, { message: "電子郵箱為必填" })
      .email({ message: "請填寫正確的電子郵箱" }),
    password: z
      .string()
      .min(1, { message: "密碼為必填" })
      .min(8, {
        message:
          "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&#",
      })
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/, {
        message:
          "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&##",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "密碼不一致",
    path: ["confirmPassword"], //message on confirmPassword
  });

export const pfSchema = z
  .object({
    pname: z
      .string()
      .min(1, { message: "姓名為必填" })
      .min(2, { message: "請填寫正確的姓名" }),
    mobile: z
      .string()
      .min(1, { message: "手機號碼為必填" })
      .length(10, { message: "請填寫正確的手機號碼" }) // 確保長度為 10
      .regex(/^09\d{8}$/, { message: "手機號碼格式錯誤" }), // 確保是台灣手機號碼格式
    item: z
      .array(z.string())
      .optional() // 可選
      .refine((val) => val.length <= 5, { message: "最多可選五項運動項目" }), // 陣列最多 5 項
    goal: z.array(z.string()).optional(),
    status: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.status === true) {
        // Correctly check intro length after trimming whitespace
        const trimmedIntro = data.intro ? data.intro.trim() : "";
        if (trimmedIntro.length <= 30) {
          return false;
        }
      }
      return true; // 若 status 為 false，不進行檢查
    },
    {
      message: "檔案狀態為公開時，自我簡介為必填，且至少需要30個字元",
      path: ["intro"],
    }
  );
