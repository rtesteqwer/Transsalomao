package com.wifiguard.enterprise;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

public final class PcapAnalyzer {
    private PcapAnalyzer() {}
    public static final class Result { public int eapolFrames,m1,m2,m3,m4; public boolean complete4Way,evidence; public String note; }
    public static Result analyze(InputStream in)throws IOException{
        byte[] data=readLimited(in,50*1024*1024); Result r=new Result();
        for(int i=0;i+12<data.length;i++){
            if((data[i]&0xff)!=0x88||(data[i+1]&0xff)!=0x8e)continue;
            int version=data[i+2]&0xff,type=data[i+3]&0xff,len=((data[i+4]&0xff)<<8)|(data[i+5]&0xff);
            if(version<1||version>3||type!=3||len<5||len>4096)continue;
            r.eapolFrames++; int keyInfo=((data[i+7]&0xff)<<8)|(data[i+8]&0xff);
            boolean install=(keyInfo&(1<<6))!=0,ack=(keyInfo&(1<<7))!=0,mic=(keyInfo&(1<<8))!=0,secure=(keyInfo&(1<<9))!=0;
            if(ack&&!mic)r.m1++; else if(!ack&&mic&&!secure)r.m2++; else if(ack&&mic&&(install||secure))r.m3++; else if(!ack&&mic&&secure)r.m4++;
        }
        r.complete4Way=r.m1>0&&r.m2>0&&r.m3>0&&r.m4>0; r.evidence=r.eapolFrames>=2||r.complete4Way;
        r.note=r.complete4Way?"Evidência forte: mensagens M1, M2, M3 e M4 foram identificadas no arquivo.":(r.evidence?"EAPOL-Key detectado, mas o analisador não confirmou as quatro mensagens completas.":"Nenhum EAPOL-Key plausível foi identificado."); return r;
    }
    private static byte[] readLimited(InputStream in,int max)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[8192];int total=0,n;while((n=in.read(buf))!=-1){total+=n;if(total>max)throw new IOException("Arquivo maior que 50 MB.");out.write(buf,0,n);}return out.toByteArray();}
}
