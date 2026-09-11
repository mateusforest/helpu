import {ProviderError,requireFields,publicUrl} from './providers.mjs';
export function googlePresence(request,tokenFor,bearer){
 const base='https://mybusinessbusinessinformation.googleapis.com/v1/';
 const location=c=>{requireFields(c,['locationId'],'Google');return 'locations/'+encodeURIComponent(c.locationId);};
 return async function(config,action,input={},requestId){
  const headers=bearer(await tokenFor(config));
  if(action==='categories')return request(base+'categories?regionCode=BR&languageCode=pt-BR&view=FULL&pageSize=100'+(input.search?'&filter='+encodeURIComponent('displayName='+input.search):''),{headers});
  if(action==='accounts')return request('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',{headers});
  if(action==='locations'){requireFields(config,['accountId'],'Google');return request(base+'accounts/'+encodeURIComponent(config.accountId)+'/locations?readMask=name,title,websiteUri,storefrontAddress,phoneNumbers,categories,profile&pageSize=100',{headers});}
  if(action==='read')return request(base+location(config)+'?readMask=name,title,websiteUri,storefrontAddress,phoneNumbers,categories,profile',{headers});
  if(action==='status')return request('https://mybusinessverifications.googleapis.com/v1/'+location(config)+'/VoiceOfMerchantState',{headers});
  if(action==='reviews'){requireFields(config,['accountId'],'Google');return request('https://mybusiness.googleapis.com/v4/accounts/'+encodeURIComponent(config.accountId)+'/'+location(config)+'/reviews?pageSize=50',{headers});}
  if(action==='reply'){requireFields(config,['accountId'],'Google');if(!input.reviewId||!input.comment||Buffer.byteLength(input.comment)>4096)throw new ProviderError('Informe uma avaliação e uma resposta com até 4.096 bytes.');return request('https://mybusiness.googleapis.com/v4/accounts/'+encodeURIComponent(config.accountId)+'/'+location(config)+'/reviews/'+encodeURIComponent(input.reviewId)+'/reply',{method:'PUT',headers,body:{comment:input.comment},uncertain:true});}
  if(action==='update'){
   const body={},fields=[];
   if(Object.hasOwn(input,'description')){
    if(typeof input.description!=='string'||input.description.length>750)throw new ProviderError('Informe uma descrição com até 750 caracteres.');
    body.profile={description:input.description};fields.push('profile.description');
   }
   if(input.website){if(!publicUrl(input.website))throw new ProviderError('Informe um site HTTPS válido.');body.websiteUri=input.website;fields.push('websiteUri');}
   if(!fields.length)throw new ProviderError('Informe a descrição ou o site que deseja atualizar.');
   return request(base+location(config)+'?updateMask='+fields.join(','),{method:'PATCH',headers,body,uncertain:true});
  }
  if(action==='create'){
   requireFields(config,['accountId'],'Google');if(config.locationId)throw new ProviderError('Já existe um perfil vinculado. Use a edição do perfil.','blocked');
   const needed=['title','category','description','street','city','state','postalCode'];if(needed.some(k=>!input[k]))throw new ProviderError('Preencha os dados reais da empresa e selecione uma categoria do Google.');if(!/^gcid:[\w-]+$/.test(input.category))throw new ProviderError('Escolha a categoria retornada pelo Google.');
   const body={languageCode:'pt-BR',title:input.title,categories:{primaryCategory:{name:input.category}},profile:{description:input.description.slice(0,750)},storefrontAddress:{regionCode:'BR',administrativeArea:input.state,locality:input.city,postalCode:input.postalCode,addressLines:[input.street]}};
   if(input.phone)body.phoneNumbers={primaryPhone:input.phone};if(input.website){if(!publicUrl(input.website))throw new ProviderError('Informe um site HTTPS válido.');body.websiteUri=input.website;}
   return request(base+'accounts/'+encodeURIComponent(config.accountId)+'/locations?requestId='+encodeURIComponent(requestId),{method:'POST',headers,body,uncertain:true});
  }
  throw new ProviderError('Ação de presença inválida.');
 };
}
