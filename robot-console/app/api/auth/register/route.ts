import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
  };

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!name || !email || password.length < 6) {
    return NextResponse.json({ error: "请填写姓名、邮箱和至少 6 位密码" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });

  if (exists) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const userCount = await prisma.user.count();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: userCount === 0 ? "ADMIN" : "USER",
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await createSession(user);

  return NextResponse.json({ user });
}
