import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSessionUser();

  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    oldPassword?: string;
    newPassword?: string;
  };

  if (!body.oldPassword || !body.newPassword || body.newPassword.length < 6) {
    return NextResponse.json({ error: "请填写原密码和至少 6 位新密码" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });

  if (!user || !(await bcrypt.compare(body.oldPassword, user.passwordHash))) {
    return NextResponse.json({ error: "原密码不正确" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
  });

  return NextResponse.json({ ok: true });
}
