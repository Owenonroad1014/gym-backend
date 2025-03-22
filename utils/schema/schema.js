import {z} from 'zod';



export const rgstSchema = z.object({
    email: z
      .string({ message: "電子郵箱為必填" })
      .email({ message: "請填寫正確的電子郵箱" }),
    password: z
      .string("密碼為必填")
      .min(8, { message: "密碼至少8個字元" })
      .regex(/[A-Z]/, {
        message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
      })
      .regex(/[a-z]/, {
        message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
      })
      .regex(/\d/, {
        message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
      })
      .regex(/[@$!%*?&#]/, {
        message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
      }),
    confirmPassword:z
    .string("密碼不一致")
  })
  .refine((data)=>data.password ===data.confirmPassword,{
    message:"密碼不一致",
    path:["confirm"],//message on confirmPassword
  });

  

  export const pfSchema = z.object({
      name: z.string("姓名不能為空").min(2, { message: "請填寫正確的姓名"}),
      mobile: z.string().min(10, { message: "請填寫正確的手機號碼"}),
      item: z.string().max(15, { message: "喜愛運動項目最多15個字元"}),
  });