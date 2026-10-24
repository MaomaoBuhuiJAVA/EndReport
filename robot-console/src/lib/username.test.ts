import {expect,it} from "vitest";
import {normalizeUsername} from "./username";
it("normalizes case and width while accepting Chinese usernames",()=>{
 expect(normalizeUsername(" Teacher_One ")).toBe("teacher_one");
 expect(normalizeUsername("园丁老师01")).toBe("园丁老师01");
 expect(normalizeUsername("Ｔｅａｃｈｅｒ")).toBe("teacher");
});
it.each([null,{},"","a","1teacher","13800138000","a b","<admin>","a".repeat(25)])("rejects ambiguous or invalid usernames %s",value=>expect(normalizeUsername(value)).toBeNull());
