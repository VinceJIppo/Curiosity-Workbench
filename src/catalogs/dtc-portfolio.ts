// Dell Technologies Capital portfolio, compiled from the public portfolio page.
// Public reference data, not customer data. Verify before customer use: the office
// marks companies verified in Innovation research > Startup catalog.
// Source: delltechnologiescapital.com/companies (read 2026-11-21).
// Descriptions: one sentence from each active company's own website (read 2026-11-21).
import type { Domain, Startup } from '../core/research/research';

export const DTC_SOURCE = 'delltechnologiescapital.com/companies';
export const DTC_AS_OF = '2026-11-21';
export const DTC_NAME = 'Dell Technologies Capital portfolio';

// name|focus areas (;)|status|website
const RAW = `Adallom|Cybersecurity|exited|
Agari|Cybersecurity|exited|
Aidaptive|AI;Enterprise Software|active|aidaptive.com/
AITAN|AI;Infrastructure|active|eyesatop.io/
Akka|AI;Infrastructure|active|akka.io
Alation|Infrastructure;Data|active|alation.com/
Alpine Data|Infrastructure;Data|exited|
Altiscale|Infrastructure;Data|exited|
Appdome|Cybersecurity|active|appdome.com/
AppMap|Enterprise Software;Developer-first|active|appmap.io
Apteligent|Infrastructure|exited|
Archipelo|Cybersecurity;AI;Developer-first|active|archipelo.com/
Arena|AI|active|arena.ai
Aria Systems|Enterprise Software|active|ariasystems.com/
Arista|Infrastructure|exited|arista.com/en/
Arkin|Infrastructure|exited|
Ascerta|AI;Enterprise Software|active|ascerta.com/
Auditoria|AI;Enterprise Software|active|auditoria.ai
Augment|Logistics;AI|active|goaugment.com/
Augtera|AI;Infrastructure|exited|augtera.com/
BabbleLabs|Infrastructure;AI;Enterprise Software|exited|
Barefoot Networks|Infrastructure|exited|
BastionZero|Cybersecurity;Developer-first|exited|
Big Switch Networks|Infrastructure|exited|
Bland.ai|AI|active|bland.ai
Bluebox|Infrastructure|exited|
Bluedata|Infrastructure;Data|exited|
Bodo|AI;Enterprise Software;Data|active|bodo.ai
Calamu|Cybersecurity;Data|active|calamu.com
Cartesia|AI|active|cartesia.ai
Cequence|Cybersecurity|active|cequence.ai/
CliQr|Cybersecurity|exited|
Cloud 66|Enterprise Software;Developer-first|active|cloud66.com/
CloudEndure|Infrastructure|exited|
Cloudknox|Cybersecurity|exited|
Cloudlink|Infrastructure;Developer-first|exited|
Clovyr|Infrastructure|exited|clovyr.io/
CUE Labs|Infrastructure;Developer-first|active|cuelang.org
Cylance|Cybersecurity;AI|exited|
Cymulate|Cybersecurity|active|cymulate.com
Cyphort|Cybersecurity|exited|
Cyvera|Cybersecurity|exited|
Dassana|Cybersecurity;Enterprise Software|exited|dassana.io
Datometry|Infrastructure;Data|exited|datometry.com/
Daybreak|Enterprise Software;AI;Data|active|daybreak.ai/
Descope|Cybersecurity;Enterprise Software;Developer-first|active|descope.com
Distyl|Enterprise Software;AI|active|distyl.ai
DocuSign|Enterprise Software|exited|docusign.com
Domino Data Lab|Enterprise Software;AI;Data|active|dominodatalab.com
DoubleAI|AI|active|doubleai.com/
Druva|Infrastructure;Cybersecurity|active|druva.com/
DSSD|Infrastructure|exited|
Elastifile|Infrastructure|exited|
Endor Labs|Cybersecurity|active|endorlabs.com/
Entro Security|Cybersecurity|exited|entro.security
Exotec|Infrastructure|active|exotec.com/en
Faction|Infrastructure;Data|active|factioninc.com
Flexor|Data;Infrastructure|active|flexor.ai
FloLIVE|Enterprise Software;Infrastructure|active|flolive.net
Fly.io|Infrastructure;AI;Developer-first|active|fly.io
FogHorn Systems|AI|exited|
FullStory|Enterprise Software|active|fullstory.com
Fungible|Infrastructure;Silicon|exited|
G2RL|Enterprise Software;AI;Logistics|active|g2rl.com
Graphcore|Infrastructure;AI;Silicon|exited|graphcore.ai/
Guardicore|Cybersecurity|exited|
Halcyon|Cybersecurity;AI|active|halcyon.ai/
Humio|Cybersecurity;Enterprise Software;Data|exited|
Hyperbolic|AI;Infrastructure|unknown|hyperbolic.ai/
Ibex|AI;Enterprise Software|active|ibex-ai.com
Iguazio Systems|Infrastructure;AI|exited|
Immuta|Data;AI|active|immuta.com
Invincea|Cybersecurity|exited|
IOTech|Infrastructure|active|iotechsys.com
JASK|Cybersecurity;AI|exited|
Jfrog|Developer-first;Infrastructure|exited|jfrog.com
LakeFS|Infrastructure;Data;AI|active|lakefs.io
Lastline|Cybersecurity|exited|
LayerX|Cybersecurity|exited|layerxsecurity.com/
Lightbits Labs|Infrastructure|active|lightbitslabs.com
Lightspin|Cybersecurity|exited|
Limitless Labs|AI|active|limitless-labs.ai/
Maginatics|Infrastructure|exited|
MavenAGI|AI;Enterprise Software|active|mavenagi.com
MaxIQ|Enterprise Software;AI|active|getmaxiq.com
MinIO|Developer-first;Infrastructure|active|min.io/
Mirantis|Developer-first;Enterprise Software|active|mirantis.com
MongoDB|Developer-first;Enterprise Software|exited|mongodb.com
Moogsoft|AI;Enterprise Software|exited|moogsoft.com
Nantero|Infrastructure;Silicon|exited|
Nasuni|Infrastructure|exited|nasuni.com/
Netskope|Cybersecurity|exited|netskope.com/
NetSpring|Enterprise Software;Data|exited|netspring.io
Nexenta|Infrastructure|exited|
NodePrime|Infrastructure|exited|
NS1|Infrastructure|exited|ns1.com/
Nutanix|Infrastructure|exited|nutanix.com/
Nuvia|Infrastructure;Silicon|exited|
Oloid|Cybersecurity|active|oloid.ai
OpenObserve|Infrastructure;Data;Enterprise Software|active|zincsearch.com
OpsMx|Developer-first;AI|active|opsmx.com/
Orion Labs|Logistics|exited|orionlabs.io/
Otonomo|Enterprise Software;Data|exited|
Oxeye|Cybersecurity|exited|oxeye.io/
Packet|Infrastructure;Developer-first|exited|
Pecan|Enterprise Software;AI;Data|active|pecan.ai
Piston|Infrastructure;Developer-first|exited|
Prime Intellect|AI|active|primeintellect.ai/
Provino|Infrastructure;Silicon|exited|
Quali|Enterprise Software;Developer-first|active|qualisystems.com
Quantum Source|Infrastructure;Silicon|active|qs-labs.com
Redis|Developer-first;Enterprise Software;Data|active|redis.com/
RedLock|Cybersecurity|exited|
Regrello|Enterprise Software;AI;Logistics|exited|regrello.com
Remediant|Cybersecurity|exited|remediant.com/
Reshuffle|Developer-first|exited|
RichRelevance|Enterprise Software;Data|exited|
RiskLens|Cybersecurity|exited|risklens.com/
RiskRecon|Cybersecurity|exited|
Rivos|Infrastructure;Silicon|exited|rivosinc.com
RunPod|Infrastructure;AI|exited|runpod.io
Savant Labs|AI;Enterprise Software|active|savantlabs.io/
ScaleiO|Infrastructure|exited|
Secuvy|Cybersecurity;AI|active|secuvy.ai
Series.ai|AI|active|series.inc/
Sightfull|Enterprise Software;Data;AI|exited|sightfull.com
SiLC|Infrastructure;Silicon|active|silc.com/
SiMa.ai|Infrastructure;AI;Silicon|active|sima.ai
SingleStore|Infrastructure;Data|active|singlestore.com
Singulr AI|Enterprise Software;Cybersecurity;AI|active|singulr.ai
Skan AI|Enterprise Software;AI|active|skan.ai
Soluble|Cybersecurity|exited|
Spanning|Infrastructure|exited|
Striim|Infrastructure;Data|active|striim.com
SuperAnnotate|AI;Infrastructure|active|superannotate.com
Swish|Enterprise Software;AI|exited|swish.ai
Sycamore|AI;Cybersecurity|active|sycamore.so/
Tag-N-Trac|Infrastructure;AI;Logistics|active|tagntrac.com
Terra Security|Cybersecurity|active|terra.security
Tetrate.io|Infrastructure;Enterprise Software|active|tetrate.io
TheLoops|Enterprise Software;AI|exited|theloops.io
Toka|Enterprise Software;Cybersecurity|active|tokagroup.com
Twine|Cybersecurity;AI|active|twinesecurity.com
TwistLock|Cybersecurity|exited|
UpThere|Infrastructure|exited|
VanishID|Cybersecurity|active|vanishid.com/
VAST Data|Infrastructure;AI;Data|active|vastdata.com
Vdoo|Cybersecurity|exited|
WaveFront|Infrastructure;Data|exited|
Xometry|Enterprise Software|exited|xometry.com/
XtremIO|Infrastructure|exited|
Yugabyte|Infrastructure|active|yugabyte.com
ZingBox|Cybersecurity|exited|
Zingly|Enterprise Software;AI|active|zingly.ai
Zscaler|Cybersecurity|exited|zscaler.com`;

/** One sentence per active company, from its own website. */
export const DTC_DESCRIPTIONS: Record<string, string> = {
  "Akka": "Akka offers an agentic AI platform for enterprises to specify, verify, and optimize AI agent applications, with an SDK for developers.",
  "Alation": "Alation's AIOS helps enterprises ensure their data apps and agents are accurate, with governance, catalog, lineage, and data quality tools.",
  "Appdome": "Appdome provides agentic defense that builds and maintains security, anti-fraud, and API protection in Android and iOS apps for mobile businesses and developers.",
  "AppMap": "AppMap records application runtime behavior locally so developers and coding agents can verify code changes against recorded traces before merge.",
  "Archipelo": "Archipelo develops Salmon, execution verification infrastructure that records cryptographically verifiable execution history for autonomous software agents and automation.",
  "Arena": "Arena lets users chat with AI models, build websites, generate images, and search the web, and publishes an AI model leaderboard.",
  "Aria Systems": "Aria Systems sells Aria Billing Cloud, a SaaS billing platform that handles subscription, usage, and outcome-based billing for as-a-service businesses.",
  "Ascerta": "Ascerta helps enterprises measure ROI, optimize spend, and track capacity use across their AI initiatives and agents.",
  "Auditoria": "Auditoria provides AI agents that run accounts payable and accounts receivable work for finance teams, from invoices and vendor emails to collections.",
  "Augment": "Augment's Augie is an AI teammate that runs freight workflows like quoting, booking, and track and trace for brokers, carriers, and distributors.",
  "Bland.ai": "Bland builds voice AI agents that answer and place phone calls for regulated industries such as healthcare, insurance, and financial services.",
  "Bodo": "Bodo provides Apache 2.0 open-source software that runs Pandas, Python, and SQL on CPUs and GPUs for data teams.",
  "Calamu": "Calamu sells Data Harbor, backup storage that transforms data so it is useless to attackers, for IT teams defending against ransomware.",
  "Cartesia": "Cartesia provides Sonic text-to-speech, Ink speech-to-text, and Managed Agents, a platform for building AI phone voice agents for developers and businesses.",
  "Cequence": "Cequence provides application, API, and AI agent protection that evaluates human, bot, and agent actions to block fraud and govern enterprise agents.",
  "Cloud 66": "Cloud 66 lets developers and ops teams deploy and manage applications on their own cloud accounts or servers without PaaS lock-in.",
  "CUE Labs": "CUE is an open source language and toolset for defining, validating, and generating configuration, API schemas, and other data.",
  "Cymulate": "Cymulate provides exposure validation that continuously tests threats and security controls, with automated control updates, for CISOs and security operations teams.",
  "Daybreak": "Daybreak provides AI agents, such as Dawn, that handle enterprise demand planning and forecasting, with human planners reviewing overrides and exceptions.",
  "Descope": "Descope provides a no-code customer and agentic identity platform for building login, MFA, and SSO journeys for developers building apps and AI agents.",
  "Distyl": "Distyl deploys agentic AI systems with human oversight for large enterprises and institutions in healthcare, financial services, and telecom and customer experience.",
  "Domino Data Lab": "Domino is an enterprise AI platform that helps large enterprises build, scale, and govern AI-powered applications, including model development, MLOps, and governance.",
  "DoubleAI": "doubleAI is an AI lab building AI for science and engineering problems, and offers Maxwell, a code execution model.",
  "Druva": "Druva provides fully managed SaaS backup and cyber recovery for enterprise cloud, SaaS, identity, and endpoint data, including AI workloads.",
  "Endor Labs": "Endor Labs provides AppSec for AI-generated code and coding agents, scanning code, dependencies, and packages and governing agent actions for security and engineering teams.",
  "Flexor": "Flexor's ACE, the AI Context Engine, turns unstructured data such as documents, emails, and calls into AI-ready context for enterprise data and AI teams.",
  "FloLIVE": "floLIVE provides global IoT cellular connectivity and a management platform for mobile operators, IoT service providers, and enterprises.",
  "Fly.io": "Fly.io is a public cloud that runs apps, AI agents, and databases on hardware-isolated Linux VMs for developers building web apps and agents.",
  "FullStory": "Fullstory provides behavioral analytics and session replay that help product, marketing, and support teams see how users interact with their digital products.",
  "G2RL": "G2RL provides agentic AI software that automates reverse logistics, including recovery, valuation, and resale of technology assets for OEMs, ITADs, and data centers.",
  "Halcyon": "Halcyon provides anti-ransomware software and a 24x7 operations center that stops and recovers from ransomware for organizations.",
  "Hyperbolic": "Hyperbolic provides on-demand and reserved H100, H200, and B200 GPU compute and an inference API for AI builders, researchers, and enterprises.",
  "Immuta": "Immuta is a data authorization platform that sets and enforces data access rules for people and AI agents at banks, pharma companies, and insurers.",
  "IOTech": "IOTech provides open, vendor-neutral edge software that connects industrial devices, prepares data for AI, and manages edge deployments for industrial operators.",
  "LakeFS": "lakeFS is version control for data lakes on object storage, giving data and AI engineering teams branches, rollback, and reproducible runs.",
  "Lightbits Labs": "Lightbits Labs offers Lightbits SDS, disaggregated block storage for analytics and transactional workloads, and Inferra, a KV cache engine for AI inference.",
  "Limitless Labs": "Limitless CAM Agent is AI software that generates CNC toolpaths inside Mastercam, Siemens NX, and Creo, for manufacturers' programming teams.",
  "MavenAGI": "Maven AGI provides an AI agent platform that resolves support, sales, and success conversations across help desks, CRM, and phone channels for CX teams.",
  "MaxIQ": "MaxIQ is an AI revenue platform on Salesforce that forecasts sales, inspects deals, and runs renewal and expansion agents for revenue teams.",
  "MinIO": "MinIO offers AIStor, S3-compatible object storage and agent memory for enterprises running AI training, inference, and lakehouse workloads.",
  "Mirantis": "Mirantis offers k0rdent AI, a Kubernetes-native control plane that provisions GPU cloud infrastructure for neoclouds and enterprises running AI workloads.",
  "Oloid": "OLOID provides passwordless login, MFA, and time clocking software for frontline workers using shared devices in manufacturing, retail, and healthcare.",
  "Pecan": "Pecan's Predictive AI Agent predicts churn, conversion, and upsell from customer history and sends audiences to Braze, Klaviyo, and Iterable for marketers.",
  "Prime Intellect": "Prime Intellect offers hosted model training, inference, and GPU compute for teams building custom AI models.",
  "Quantum Source": "Quantum Source develops photonic quantum computers that use single atoms on photonic chips to generate photons and gates for fault-tolerant computing.",
  "Redis": "Redis provides a real-time data platform with caching, vector search, agent memory, and data sync for developers building AI and real-time apps.",
  "Savant Labs": "Savant is an AI automation platform for finance teams that builds governed agents to automate close, reconciliation, tax, and reporting tasks.",
  "Secuvy": "Secuvy finds and classifies enterprise data in place and tags it for AI pipelines, serving CDOs, CISOs, and AI and data leaders.",
  "Series.ai": "Series Entertainment is a game studio that uses generative AI to turn creative ideas into franchise games for players.",
  "SiLC": "SiLC makes Eyeonic 4D vision and laser scanner sensors that machines use to see distance and velocity for industrial, robotics, and security uses.",
  "SiMa.ai": "SiMa.ai provides hardware and software for building physical AI applications that run on-device in drones, robotics, automotive, and industrial systems.",
  "Singulr AI": "Singulr AI provides a control plane that discovers, governs, and secures enterprise AI apps and agents, for CISO, IT, and privacy teams.",
  "Skan AI": "Skan AI provides a platform that maps how work gets done and deploys governed AI agents for regulated industries such as banking and insurance.",
  "Striim": "Striim provides real-time data integration and streaming software that moves and unifies data across databases, applications, and clouds for enterprises.",
  "Sycamore": "Sycamore offers Build and Govern software that turns business processes into agentic apps and governs AI systems for enterprises.",
  "Tag-N-Trac": "Tag-N-Trac provides IoT tracking tags and an AI supply chain visibility platform for pharma and perishables shippers, 3PLs, and freight forwarders.",
  "Terra Security": "Terra is an agentic offensive security platform that continuously tests AI systems, networks, and web apps for security teams, with human oversight.",
  "Tetrate.io": "Tetrate's Agent Router is an AI gateway that routes requests to models, attributes spend by team, and sets usage policy for enterprises.",
  "Toka": "Toka provides signals intelligence and access capabilities that help trusted governments counter terrorism, crime, and near-peer adversaries.",
  "Twine": "Twine offers AI digital employees, starting with Alex, that run identity and access management tasks for security teams inside existing IGA and IdP tools.",
  "VanishID": "VanishID monitors and removes exposed personal identity data for executives, employees, families, and public officials to reduce social engineering and impersonation risk.",
  "VAST Data": "VAST AI OS unifies storage, database, and compute so enterprises, cloud providers, and AI teams can run AI workloads on one data platform.",
  "Yugabyte": "YugabyteDB is a distributed PostgreSQL-compatible database for developers and operators running mission-critical applications across regions and clouds.",
  "Zingly": "Zingly provides AI with human experts and systems for high-stakes customer journeys in retirement, insurance, banking, credit unions, and airlines.",
};

const FOCUS_TO_DOMAIN: Record<string, Domain[]> = {
  Cybersecurity: ['cybersecurity'],
  AI: ['ai'],
  Data: ['ai'],
  Infrastructure: ['virtualization'],
  Silicon: ['virtualization'],
  'Developer-first': ['automation'],
  'Enterprise Software': ['automation'],
  Logistics: ['automation'],
};

const CX_WORDS = /\bcx\b|customer (support|service|experience|conversation|engagement|journey|history)|customer journeys|contact center|call center|support (team|agent|conversation)|support, sales|digital experience|digital products|voice (ai )?agents?|phone calls?|session replay|shopper|ecommerce/i;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function dtcCatalog(): Startup[] {
  return RAW.split('\n').map((line) => {
    const [name, focus, status, website] = line.split('|');
    const categories = focus.split(';').filter(Boolean);
    const description = DTC_DESCRIPTIONS[name] ?? '';
    const domains = [...new Set(categories.flatMap((c) => FOCUS_TO_DOMAIN[c] ?? []))];
    if (CX_WORDS.test(description)) domains.push('cx');
    return {
      id: `dtc-${slug(name)}`,
      name,
      description,
      domains,
      categories,
      status,
      website: website ? website.replace(/\/+$/, '') : undefined,
      investor: 'Dell Technologies Capital',
      source: DTC_SOURCE,
      asOf: DTC_AS_OF,
      verified: false,
    };
  });
}
