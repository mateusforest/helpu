try{
  const response=await fetch('http://127.0.0.1:8080/v1/status',{headers:{Authorization:'Bearer '+process.env.HELPU_RUNTIME_SECRET,'X-Helpu-Company':'00000000-0000-4000-8000-000000000000'},signal:AbortSignal.timeout(5_000)});
  const status=await response.json();process.exit(response.ok&&status.protocol===1?0:1);
}catch{process.exit(1);}
