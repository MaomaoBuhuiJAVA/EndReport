import {beforeEach, expect, it, vi} from "vitest";
import {Prisma} from "@prisma/client";
vi.mock("@/lib/auth",()=>({getSessionUser:vi.fn(),createSession:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{user:{findUnique:vi.fn(),updateMany:vi.fn()}}}));
import {getSessionUser,createSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {POST} from "./route";
const user={id:"u1",name:"家长",username:null,phone:"13800138000",role:"USER" as const,sessionVersion:3,passwordHash:"hash",accountType:"PARENT" as const,identityVerified:false};
const request=(body:unknown={username:" Parent_One "},headers:Record<string,string>={})=>new Request("https://guokeey.cn/api/auth/username",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getSessionUser).mockResolvedValue(user);vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never).mockResolvedValue(null);vi.mocked(prisma.user.updateMany).mockResolvedValue({count:1});});
it("requires a valid session before reading or changing the account",async()=>{
 vi.mocked(getSessionUser).mockResolvedValueOnce(null);
 expect((await POST(request())).status).toBe(401);
 expect(prisma.user.findUnique).not.toHaveBeenCalled();expect(prisma.user.updateMany).not.toHaveBeenCalled();
});
it("sets a unique normalized username without a password, preserving identity and phone",async()=>{
 const r=await POST(request());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({user:{username:"parent_one",phone:user.phone,role:"USER",identityVerified:false}});
 expect(prisma.user.updateMany).toHaveBeenCalledWith({where:{id:user.id,sessionVersion:3},data:{username:"parent_one",sessionVersion:{increment:1}}});
 expect(createSession).toHaveBeenCalledWith(expect.objectContaining({username:"parent_one",sessionVersion:4}));
});
it("rejects an account removed or invalidated after the session check",async()=>{
 vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValueOnce(null);
 expect((await POST(request())).status).toBe(401);
 vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({...user,sessionVersion:4} as never);
 expect((await POST(request())).status).toBe(401);
 expect(prisma.user.updateMany).not.toHaveBeenCalled();expect(createSession).not.toHaveBeenCalled();
});
it("rejects invalid usernames",async()=>{
 expect((await POST(request({username:"123"}))).status).toBe(400);
 expect(prisma.user.updateMany).not.toHaveBeenCalled();
});
it("rejects duplicate names, including racing claims",async()=>{
 vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValueOnce(user as never).mockResolvedValueOnce({id:"other"} as never);
 expect((await POST(request())).status).toBe(409);expect(prisma.user.updateMany).not.toHaveBeenCalled();
 vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never).mockResolvedValueOnce(null);
 vi.mocked(prisma.user.updateMany).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique",{code:"P2002",clientVersion:"6.19.3"}));
 expect((await POST(request())).status).toBe(409);
});
it("blocks cross-site changes and concurrent password/session changes",async()=>{
 expect((await POST(request(undefined,{origin:"https://foreign.invalid"}))).status).toBe(403);
 expect(prisma.user.updateMany).not.toHaveBeenCalled();
 vi.mocked(prisma.user.updateMany).mockResolvedValue({count:0});
 expect((await POST(request())).status).toBe(409);expect(createSession).not.toHaveBeenCalled();
});
