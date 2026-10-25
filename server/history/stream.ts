// Read a bulk JSON dictionary without keeping the complete (1GB+) file in memory.
// Only the requested UUID values are retained. Braces inside strings are handled.
export async function* selectPriceObjects(chunks:AsyncIterable<string|Uint8Array>,wanted:Set<string>):AsyncGenerator<{uuid:string;value:unknown}> {
    let buffer='',uuid:string|null=null,depth=0,inString=false,escaped=false,capture='';
    const decoder=new TextDecoder();
    const remaining=new Set(wanted);
    if (!remaining.size) return;
    for await (const chunk of chunks) {
        buffer+=typeof chunk==='string'?chunk:decoder.decode(chunk,{stream:true});
        let cursor=0;
        while(cursor<buffer.length) {
            if(uuid===null) {
                const match=/"([a-f0-9-]{36})"\s*:\s*\{/ig;
                match.lastIndex=cursor;
                const hit=match.exec(buffer);
                if(!hit) {buffer=buffer.slice(Math.max(cursor,buffer.length-100));cursor=buffer.length;break;}
                uuid=hit[1].toLowerCase();cursor=match.lastIndex-1;
                depth=0;inString=false;escaped=false;capture='';
            }
            const keep=remaining.has(uuid);
            let segment=cursor;
            for(;cursor<buffer.length;cursor++) {
                const c=buffer[cursor];
                if(inString) {
                    if(escaped) escaped=false;
                    else if(c==='\\') escaped=true;
                    else if(c==='"') inString=false;
                } else if(c==='"') inString=true;
                else if(c==='{') depth++;
                else if(c==='}') depth--;
                if(depth===0&&!inString) {
                    if(keep) {
                        capture+=buffer.slice(segment,cursor+1);
                        yield {uuid,value:JSON.parse(capture)};
                        remaining.delete(uuid);
                        if(!remaining.size) return;
                    }
                    cursor++;uuid=null;capture='';break;
                }
            }
            if(uuid!==null) {
                if(keep) {
                    capture+=buffer.slice(segment);
                    if(capture.length>4*1024*1024) throw new Error('A card price entry exceeded the safe import size.');
                }
                buffer='';cursor=0;break;
            }
        }
        if(uuid===null&&cursor>=buffer.length&&buffer.length>100) buffer=buffer.slice(-100);
    }
    if(uuid!==null) throw new Error('The price file ended in the middle of an entry.');
}
