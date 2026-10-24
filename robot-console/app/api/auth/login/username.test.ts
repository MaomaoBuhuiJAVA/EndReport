import {beforeEach, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({createSession: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findUnique: vi.fn(), update: vi.fn()}}}));
vi.mock("bcryptjs", () => ({default: {compare: vi.fn(async () => true)}}));
import {prisma} from "@/lib/prisma";
import {createSession} from "@/lib/auth";
import bcrypt from "bcryptjs";
import {POST} from "./route";
const user={id:"u1",name:"老师",username:"teacher_one",phone:"13800138000",passwordHash:"hash",role:"USER",sessionVersion:0};
const request=(body:unknown)=>new Request("https://guokeey.cn/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);vi.mocked(prisma.user.update).mockResolvedValue({} as never);vi.mocked(bcrypt.compare).mockResolvedValue(true as never);});
it("accepts a normalized username with the existing password",async()=>{
 const r=await POST(request({identifier:" Teacher_One ",password:"password",acceptedPolicies:true}));
 expect(r.status).toBe(200);expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{username:"teacher_one"}});
 expect(await r.json()).toMatchObject({user:{username:"teacher_one"}});expect(createSession).toHaveBeenCalled();
});
it("keeps legacy phone payloads working",async()=>{
 expect((await POST(request({phone:user.phone,password:"password",acceptedPolicies:true}))).status).toBe(200);
 expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{phone:user.phone}});
});
it("accepts a phone in the username field",async()=>{
 expect((await POST(request({identifier:user.phone,password:"password",acceptedPolicies:true}))).status).toBe(200);
 expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{phone:user.phone}});
});
it("requires the password for either login identifier",async()=>{
 vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
 expect((await POST(request({identifier:"teacher_one",password:"wrong",acceptedPolicies:true}))).status).toBe(401);
 expect(createSession).not.toHaveBeenCalled();
});
it("rejects ambiguous numeric usernames and malformed identifiers",async()=>{
 for(const identifier of ["1234",{},"a".repeat(25),"a b"]){expect((await POST(request({identifier,password:"password"}))).status).toBe(400);}
 expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
