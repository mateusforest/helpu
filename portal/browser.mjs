import {mapAsync} from "./async-collections.mjs";
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ProviderError} from './providers.mjs';
import {findBrowser} from '../scripts/runtime.mjs';
export const BROWSER_CHANNELS = [{
  id: 'instagram',
  name: 'Instagram',
  url: 'https://www.instagram.com/',
  domains: ['instagram.com']
}, {
  id: 'whatsapp',
  name: 'WhatsApp Web',
  url: 'https://web.whatsapp.com/',
  domains: ['whatsapp.com']
}, {
  id: 'google',
  name: 'Perfil da Empresa no Google',
  url: 'https://business.google.com/',
  domains: ['google.com', 'google.com.br']
}, {
  id: 'higgsfield',
  name: 'Higgsfield',
  url: 'https://higgsfield.ai/',
  domains: ['higgsfield.ai']
}];
export async function createBrowserManager({db, dataDir, launch, assetPath,cloud=false}) {
  if(cloud){
    const message='Este canal precisa de um executor de navegador persistente conectado à Helpu. A sessão local não foi transferida para a nuvem.';
    const status=(org,channel)=>({available:false,status:'blocked',code:'blocked_persistent_browser_required',executor:'browser',companyId:org,channel,message});
    const blocked=async()=>{const error=new ProviderError(message,'blocked');error.code='blocked_persistent_browser_required';throw error;};
    return {list:async org=>BROWSER_CHANNELS.map(d=>({id:d.id,name:d.name,accountLabel:'',confirmedAt:null,automationAllowed:false,open:false,saved:false,busy:false,local:false,connectionState:'blocked',identity:null,validation:null,executorAvailable:false,operationalReady:false,blocker:status(org,d.id)})),open:blocked,observe:blocked,confirm:blocked,action:blocked,claim:blocked,release:async()=>{},close:async()=>{},freeze:async()=>{},shutdown:async()=>{},executorStatus:status};
  }
  const sessions = new Map(), opening = new Map();
  await db.prepare("UPDATE browser_profiles SET automation_allowed=0,uncertain_note=COALESCE(uncertain_note,'Uma interação foi interrompida. Confira o resultado na conta antes de liberar a sessão.') WHERE pending_job_id IS NOT NULL").run();
  await db.prepare("UPDATE browser_profiles SET automation_allowed=0,uncertain_note=COALESCE(uncertain_note,'A conversa foi interrompida após operar esta conta. Confira os passos antes de liberar a sessão.') WHERE EXISTS (SELECT 1 FROM jobs j,json_each(j.external,'$.browserChannels') channel WHERE j.org_id=browser_profiles.org_id AND j.kind='conversation' AND j.state IN ('working','uncertain') AND json_extract(j.external,'$.conversationEffectsStarted')=1 AND channel.value=browser_profiles.channel)").run();
  const key = (org, channel) => org + ':' + channel;
  const validationFor = async (org, channel) => {
    const row = await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='connection_validation' AND external_id=?").get(org, 'browser:' + channel);
    return row ? JSON.parse(row.data) : null;
  };
  async function saveValidation(org, channel, patch, actor = 'browser') {
    const now = Date.now(), previous = await validationFor(org, channel) || ({}), value = {
      ...previous,
      ...patch,
      provider: channel,
      executor: 'browser',
      updatedAt: now
    }, externalId = 'browser:' + channel;
    const row = await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='connection_validation' AND external_id=?").get(org, externalId);
    if (row) await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND org_id=?').run(JSON.stringify(value), now, row.id, org); else await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'connection_validation',?,?,?,?)").run(randomUUID(), org, JSON.stringify(value), externalId, now, now);
    if (previous.status !== value.status || patch.confirmedAt) await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(), org, String(actor), 'Identidade do navegador: ' + value.status, row?.id || externalId, channel, now);
    return value;
  }
  const executorStatus = (org, channel, action = 'publish') => {
    definition(channel);
    return {
      available: false,
      status: 'blocked',
      code: 'blocked_browser_executor_unvalidated',
      executor: 'browser',
      companyId: org,
      channel,
      action,
      message: 'A sessão permite observação e interação assistida, mas não há executor de publicação por navegador com verificação validada para este canal.'
    };
  };
  const definition = channel => {
    const d = BROWSER_CHANNELS.find(c => c.id === channel);
    if (!d) throw new ProviderError('Canal de navegador não disponível.', 'blocked');
    return d;
  };
  const validUrl = (value, channel) => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password && definition(channel).domains.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  };
  function localOnly() {
    if (process.env.HELPU_PUBLIC_URL) throw new ProviderError('O navegador local precisa ser operado no computador da Helpu. A conexão com uma instalação em nuvem requer o companion pareado.', 'blocked');
  }
  async function list(org) {
    return await mapAsync(BROWSER_CHANNELS, async d => {
      const p = await db.prepare('SELECT * FROM browser_profiles WHERE org_id=? AND channel=?').get(org, d.id);
      const s = sessions.get(key(org, d.id)), validation = await validationFor(org, d.id);
      const connectionState = p?.uncertain_note ? 'uncertain' : !s ? 'disconnected' : s.challenge ? 'authentication_required' : !p?.confirmed_at ? 'identity_unconfirmed' : validation?.status === 'identity_confirmed' ? 'identity_confirmed' : 'identity_declared';
      return {
        id: d.id,
        name: d.name,
        accountLabel: p?.account_label || '',
        confirmedAt: p?.confirmed_at || null,
        automationAllowed: !!p?.automation_allowed,
        open: !!s,
        saved: !!p,
        busy: !!s?.owner,
        uncertainNote: p?.uncertain_note || null,
        challenge: s?.challenge || false,
        url: s?.page?.url() || null,
        local: true,
        connectionState,
        identity: validation?.identity || null,
        validation,
        executorAvailable: false,
        operationalReady: false,
        blocker: executorStatus(org, d.id)
      };
    });
  }
  async function open(org, channel) {
    localOnly();
    definition(channel);
    const k = key(org, channel);
    if (sessions.has(k)) {
      await sessions.get(k).page.bringToFront();
      return (await list(org)).find(x => x.id === channel);
    }
    if (opening.has(k)) return opening.get(k);
    const promise = (async () => {
      const profile = path.join(dataDir, 'browser-profiles', org, channel);
      fs.mkdirSync(profile, {
        recursive: true
      });
      let context;
      try {
        if (launch) context = await launch(profile); else {
          const {chromium} = await import('playwright-core');
          const executablePath = findBrowser();
          if (!executablePath) throw new Error('browser-not-installed');
          context = await chromium.launchPersistentContext(profile, {
            executablePath,
            headless: false,
            viewport: {
              width: 1280,
              height: 820
            },
            acceptDownloads: false,
            serviceWorkers: 'block',
            args: ['--disable-background-networking']
          });
        }
      } catch {
        throw new ProviderError('Não foi possível abrir o navegador. Instale as dependências do projeto e mantenha Chrome ou Edge instalado neste computador.', 'blocked');
      }
      await context.route('**/*', route => {
        const req = route.request();
        let u;
        try {
          u = new URL(req.url());
        } catch {
          return route.abort();
        }
        if ((/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i).test(u.hostname) || (/^172\.(1[6-9]|2\d|3[01])\./).test(u.hostname) || (/\.(local|internal)$/i).test(u.hostname)) return route.abort();
        if (req.isNavigationRequest() && !validUrl(u.href, channel) && u.href !== 'about:blank') return route.abort();
        return route.continue();
      });
      const page = context.pages()[0] || await context.newPage();
      const s = {
        context,
        page,
        owner: null,
        token: null,
        refs: new Set(),
        challenge: false,
        lastObserved: 0
      };
      sessions.set(k, s);
      context.on('page', p => {
        p.on('download', d => d.cancel().catch(() => {}));
      });
      context.on('close', () => {
        sessions.delete(k);
      });
      page.on('download', d => d.cancel().catch(() => {}));
      page.on('filechooser', chooser => {
        s.chooser = chooser;
      });
      await db.prepare('INSERT INTO browser_profiles(org_id,channel,updated_at) VALUES(?,?,?) ON CONFLICT(org_id,channel) DO UPDATE SET confirmed_at=NULL,automation_allowed=0,updated_at=excluded.updated_at').run(org, channel, Date.now());
      await saveValidation(org, channel, {
        status: 'session_open',
        confirmedAt: null,
        actorId: null,
        executorAvailable: false,
        blocker: 'blocked_browser_executor_unvalidated'
      });
      try {
        await page.goto(definition(channel).url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } catch {}
      return (await list(org)).find(x => x.id === channel);
    })().finally(() => opening.delete(k));
    opening.set(k, promise);
    return promise;
  }
  function session(org, channel) {
    const s = sessions.get(key(org, channel));
    if (!s) throw new ProviderError('Abra a sessão em Contas conectadas e faça login.', 'blocked');
    return s;
  }
  async function observe(org, channel, {image = false, passive = false} = {}) {
    const s = session(org, channel);
    const pages = s.context.pages().filter(p => validUrl(p.url(), channel));
    if (s.page.isClosed() && pages.length) s.page = pages.at(-1);
    if (!validUrl(s.page.url(), channel)) throw new ProviderError('A sessão está fora do canal permitido. Volte à página da conta.', 'blocked');
    const observation = await s.page.evaluate(({passive, channel}) => {
      const visible = e => {
        const r = e.getBoundingClientRect(), style = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const body = document.body?.innerText || '';
      const auth = [...document.querySelectorAll('input[type=password],input[autocomplete=one-time-code],iframe[src*="captcha"]')].some(visible) || (/scan (this |the )?qr|escaneie.*qr|enter.*verification code|insira.*código de verificação|confirme que você é humano|verify you are human/i).test(body);
      if (auth) return {
        challenge: true,
        text: 'A sessão exige autenticação ou confirmação pelo usuário.',
        elements: []
      };
      const elements = passive ? [] : [...document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=textbox],[contenteditable=true]')].filter(visible).slice(0, 100).map((e, i) => {
        const ref = 'e' + i;
        e.setAttribute('data-helpu-ref', ref);
        return {
          ref,
          role: e.getAttribute('role') || e.tagName.toLowerCase(),
          label: (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.innerText || e.getAttribute('name') || '').slice(0, 160),
          type: e.getAttribute('type') || '',
          href: e.tagName === 'A' ? e.href : undefined
        };
      });
      const identities = channel === 'instagram' ? [...document.querySelectorAll('a[href]')].filter(visible).flatMap(e => {
        const label = (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ');
        if (!(/^(?:your |seu )?(?:profile|perfil)$/i).test(label)) return [];
        let url;
        try {
          url = new URL(e.href);
        } catch {
          return [];
        }
        const match = (/^\/([a-zA-Z0-9_.]{1,30})\/?$/).exec(url.pathname);
        if (!match || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || ['accounts', 'explore', 'direct', 'reels', 'stories', 'p'].includes(match[1].toLowerCase())) return [];
        return [{
          username: match[1].toLowerCase(),
          profileUrl: url.origin + url.pathname,
          source: 'visible_self_profile_link',
          label
        }];
      }).slice(0, 4) : [];
      return {
        challenge: false,
        text: body.slice(0, 14000),
        elements,
        identities
      };
    }, {
      passive,
      channel
    });
    s.identities = (observation.identities || []).filter(i => typeof i.username === 'string' && (/^[a-zA-Z0-9_.]{1,30}$/).test(i.username) && validUrl(i.profileUrl, channel));
    s.challenge = observation.challenge;
    if (!passive) {
      s.token = randomUUID();
      s.refs = new Set(observation.elements.map(e => e.ref));
      s.lastObserved = Date.now();
      s.observedUrl = s.page.url();
    }
    if (observation.challenge) await db.prepare('UPDATE browser_profiles SET confirmed_at=NULL,automation_allowed=0 WHERE org_id=? AND channel=?').run(org, channel);
    const previous = await validationFor(org, channel), usernames = [...new Set(s.identities.map(i => i.username.toLowerCase()))], detected = usernames.length === 1 ? s.identities[0] : null;
    if (observation.challenge) {
      if (previous?.status !== 'authentication_required') await saveValidation(org, channel, {
        status: 'authentication_required',
        confirmedAt: null,
        actorId: null
      });
    } else if (channel === 'instagram' && previous?.confirmedAt && (!detected || previous.identity?.username !== detected.username)) {
      await db.prepare('UPDATE browser_profiles SET confirmed_at=NULL,automation_allowed=0 WHERE org_id=? AND channel=?').run(org, channel);
      await saveValidation(org, channel, {
        status: detected ? 'identity_mismatch' : 'identity_unconfirmed',
        identity: detected ? {
          ...detected,
          observedAt: Date.now()
        } : null,
        confirmedAt: null,
        actorId: null
      });
    } else if (detected && !previous?.confirmedAt && (previous?.identity?.username !== detected.username || previous?.status !== 'identity_observed')) await saveValidation(org, channel, {
      status: 'identity_observed',
      identity: {
        ...detected,
        observedAt: Date.now()
      },
      confirmedAt: null,
      actorId: null
    });
    const profile = await db.prepare('SELECT account_label,confirmed_at FROM browser_profiles WHERE org_id=? AND channel=?').get(org, channel);
    const result = {
      ...observation,
      identity: detected,
      identityCandidates: s.identities,
      accountDeclaredByUser: profile?.account_label || null,
      accountConfirmedByUserAt: profile?.confirmed_at || null,
      url: s.page.url(),
      title: await s.page.title(),
      snapshotToken: s.token,
      observedAt: s.lastObserved
    };
    if (image && !observation.challenge) result.image = (await s.page.screenshot({
      type: 'jpeg',
      quality: 55,
      animations: 'disabled'
    })).toString('base64');
    return result;
  }
  async function confirm(org, channel, accountLabel, automation, reviewed = false, {actorId} = {}) {
    localOnly();
    if (!actorId || !await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(org, actorId)) throw new ProviderError('A confirmação de identidade precisa de um usuário autenticado da empresa.', 'blocked');
    if (session(org, channel).owner) throw new ProviderError('Aguarde a execução atual antes de alterar a autorização.', 'blocked');
    const previous = await db.prepare('SELECT uncertain_note FROM browser_profiles WHERE org_id=? AND channel=?').get(org, channel);
    if (previous?.uncertain_note && !reviewed) throw new ProviderError('Confira o resultado da última ação na conta antes de liberar a sessão.', 'blocked');
    const label = String(accountLabel || '').trim().slice(0, 120);
    if (!label) throw new ProviderError('Informe qual conta você abriu nesta sessão.', 'blocked');
    const observation = await observe(org, channel);
    if (observation.challenge) throw new ProviderError('Conclua o login no navegador antes de confirmar a conta.', 'blocked');
    const detected = observation.identity;
    if (channel === 'instagram' && (!detected || detected.username !== label.replace(/^@/, '').toLowerCase())) throw new ProviderError('A identidade digitada não coincide com o link de perfil próprio observado no Instagram. Abra a navegação da conta correta e observe novamente.', 'blocked');
    const now = Date.now(), identity = channel === 'instagram' ? {
      ...detected,
      observedAt: now
    } : {
      label,
      profileUrl: observation.url,
      source: 'user_declaration_after_observation',
      observedAt: now
    };
    await saveValidation(org, channel, {
      status: channel === 'instagram' ? 'identity_confirmed' : 'identity_declared',
      identity,
      actorId,
      confirmedAt: now,
      observation: {
        url: observation.url,
        title: observation.title,
        observedAt: now,
        source: identity.source
      },
      executorAvailable: false,
      blocker: 'blocked_browser_executor_unvalidated'
    }, actorId);
    await db.prepare('UPDATE browser_profiles SET uncertain_note=NULL,pending_job_id=NULL,account_label=?,confirmed_at=?,automation_allowed=?,updated_at=? WHERE org_id=? AND channel=?').run(label, now, automation ? 1 : 0, now, org, channel);
    return (await list(org)).find(x => x.id === channel);
  }
  function claim(org, channel, runId) {
    const s = session(org, channel);
    if (s.owner && s.owner !== runId) throw new ProviderError('Esta conta está sendo usada por outra execução. Aguarde.', 'blocked');
    s.owner = runId;
  }
  function release(runId) {
    for (const s of sessions.values()) if (s.owner === runId) s.owner = null;
  }
  async function action(org, channel, input, runId) {
    localOnly();
    const s = session(org, channel), p = await db.prepare('SELECT * FROM browser_profiles WHERE org_id=? AND channel=?').get(org, channel);
    if (p?.uncertain_note) throw new ProviderError(p.uncertain_note, 'blocked');
    if (!p?.confirmed_at || !p.automation_allowed) throw new ProviderError('Confirme a conta e permita a operação em Contas conectadas.', 'blocked');
    const validation = await validationFor(org, channel);
    if (!validation?.actorId || channel === 'instagram' && validation.status !== 'identity_confirmed') throw new ProviderError('Confirme a identidade observada com um usuário da empresa antes de operar.', 'blocked');
    claim(org, channel, runId);
    if (s.challenge) throw new ProviderError('O usuário precisa concluir a autenticação.', 'blocked');
    if (!validUrl(s.page.url(), channel)) throw new ProviderError('Página fora do canal permitido.', 'blocked');
    const apply = async operation => {
      await db.prepare('UPDATE browser_profiles SET pending_job_id=?,updated_at=? WHERE org_id=? AND channel=?').run(runId, Date.now(), org, channel);
      try {
        await operation();
        await db.prepare('UPDATE browser_profiles SET pending_job_id=NULL WHERE org_id=? AND channel=?').run(org, channel);
      } catch (e) {
        await db.prepare('UPDATE browser_profiles SET automation_allowed=0,uncertain_note=? WHERE org_id=? AND channel=?').run('A interação não teve confirmação. Confira seu resultado antes de liberar a sessão.', org, channel);
        throw e;
      }
    };
    if (input.op === 'navigate') {
      if (!validUrl(input.url, channel)) throw new ProviderError('O destino não pertence a este canal.', 'blocked');
      await apply(() => s.page.goto(input.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }));
    } else if (input.op === 'upload' && s.chooser) {
      const file = await assetPath(org, input.assetId);
      await apply(() => s.chooser.setFiles(file, {
        timeout: 10000
      }));
      s.chooser = null;
    } else if (input.op === 'scroll') {
      await apply(() => s.page.mouse.wheel(0, Math.max(-1000, Math.min(1000, Number(input.amount) || 600))));
    } else {
      if (s.observedUrl !== s.page.url() || input.snapshotToken !== s.token || Date.now() - s.lastObserved > 90000 || !s.refs.has(input.ref)) throw new ProviderError('A página mudou. Observe novamente antes de agir.', 'blocked');
      const el = s.page.locator('[data-helpu-ref="' + input.ref + '"]');
      if (await el.count() !== 1) throw new ProviderError('Elemento não encontrado. Observe novamente.', 'blocked');
      const secret = await el.evaluate(e => e.type === 'password' || e.autocomplete === 'one-time-code' || (/password|senha|token|otp|verification/i).test(e.name || ''));
      if (secret) throw new ProviderError('Credenciais e códigos são preenchidos pelo usuário.', 'blocked');
      if (input.op === 'click') await apply(() => el.click({
        timeout: 10000
      })); else if (input.op === 'fill') await apply(() => el.fill(String(input.text || '').slice(0, 20000), {
        timeout: 10000
      })); else if (input.op === 'select') await apply(() => el.selectOption(String(input.text || ''), {
        timeout: 10000
      })); else if (input.op === 'press') {
        if (!['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace'].includes(input.text)) throw new ProviderError('Tecla não permitida.', 'blocked');
        await apply(() => el.press(input.text, {
          timeout: 10000
        }));
      } else if (input.op === 'upload') {
        const file = await assetPath(org, input.assetId);
        await apply(() => el.setInputFiles(file, {
          timeout: 10000
        }));
      } else throw new ProviderError('Ação de navegador inválida.', 'blocked');
    }
    s.token = null;
    return {
      actionApplied: true,
      confirmation: 'Interação aplicada. Observe o resultado; isto não confirma publicação ou envio.',
      url: s.page.url()
    };
  }
  async function close(org, channel) {
    const s = sessions.get(key(org, channel));
    if (!s) return;
    if (s.owner) throw new ProviderError('Pause a conversa antes de fechar esta sessão.', 'blocked');
    await s.context.close();
  }
  return {
    list,
    open,
    observe,
    confirm,
    action,
    claim,
    release,
    close,
    executorStatus,
    async freeze(org, channel, note) {
      await db.prepare('UPDATE browser_profiles SET uncertain_note=?,automation_allowed=0 WHERE org_id=? AND channel=?').run(note, org, channel);
      await saveValidation(org, channel, {
        status: 'uncertain',
        confirmedAt: null,
        actorId: null
      });
    },
    async shutdown() {
      await Promise.allSettled([...sessions.values()].map(s => s.context.close()));
    }
  };
}
