import { buildSimularGratisWhatsAppUrl } from '../config/sales'
import { useRevealClasses } from '../hooks/useInView'
import { ProductAboutStats } from './product-about-stats'
import './ProductAboutPage.css'

const EXPERIENCE = [
  {
    title: 'UFRGS / ANP',
    text:
      'Laboratório de Combustíveis da Universidade Federal do Rio Grande do Sul e atuação junto à Agência Nacional do Petróleo, Gás Natural e Biocombustíveis.',
  },
  {
    title: 'REFAP',
    text:
      'Refinaria Alberto Pasqualini, Laboratório de Desenvolvimento de Produtos, com foco em qualidade e especificação de combustíveis.',
  },
  {
    title: 'BR Distribuidora',
    text: 'Atuação técnica de referência e suporte à rede revendedora em todo o país.',
  },
  {
    title: 'Atuação internacional',
    text: 'Projetos de consultoria, auditoria e engenharia desenvolvidos no Brasil e no Uruguai.',
  },
]

const FORMATION = [
  'Engenharia',
  'Gestão da Qualidade',
  'MBA Segurança do Trabalho',
  'MBA Metrologia Legal',
  'MBA Segurança Alimentar',
  'MBA Ambiental',
]

function LandingBackdrop({ variant }: { variant: 'cta' | 'footer' }) {
  return (
    <div className={`product-landing__backdrop product-landing__backdrop--${variant}`} aria-hidden="true">
      <span className="product-landing__backdrop-photo" />
      <span className="product-landing__backdrop-grid" />
      <span className="product-landing__orb product-landing__orb--1" />
      <span className="product-landing__orb product-landing__orb--2" />
      <span className="product-landing__orb product-landing__orb--3" />
      <span className="product-landing__backdrop-glow" />
    </div>
  )
}

function ExperienceCard({
  item,
  index,
}: {
  item: { title: string; text: string }
  index: number
}) {
  const reveal = useRevealClasses<HTMLElement>('up', index * 90)
  return (
    <article ref={reveal.ref} className={`product-landing__card ${reveal.className}`} style={reveal.style}>
      <h3>{item.title}</h3>
      <p>{item.text}</p>
    </article>
  )
}

function FormationChip({ label, index }: { label: string; index: number }) {
  const reveal = useRevealClasses<HTMLLIElement>('scale', 120 + index * 55)
  return (
    <li ref={reveal.ref} className={reveal.className} style={reveal.style}>
      {label}
    </li>
  )
}

function PlatformModule({
  module,
  index,
}: {
  module: { title: string; text: string }
  index: number
}) {
  const reveal = useRevealClasses<HTMLElement>('up', index * 75)
  return (
    <article ref={reveal.ref} className={`product-landing__module ${reveal.className}`} style={reveal.style}>
      <span className="product-landing__module-num" aria-hidden="true">
        {index + 1}
      </span>
      <h3>{module.title}</h3>
      <p>{module.text}</p>
    </article>
  )
}

const PLATFORM_MODULES = [
  {
    title: 'Transparência e qualidade em tempo real',
    text:
      'O consumidor verifica em tempo real a qualidade e a procedência do combustível que está abastecendo.',
  },
  {
    title: 'Controle metrológico',
    text: 'Verificações, equipamentos e conformidade com os órgãos reguladores em um só lugar.',
  },
  {
    title: 'Documentos regulatórios',
    text: 'Alertas para os responsáveis legais, com credibilidade, transparência e segurança jurídica.',
  },
  {
    title: 'Segurança do trabalho',
    text: 'Treinamentos obrigatórios, NRs e exigências do Ministério do Trabalho e Emprego.',
  },
  {
    title: 'Controle ambiental',
    text: 'Licenças, resíduos e obrigações ambientais do posto sob controle.',
  },
]

export default function ProductAboutPage() {
  const whatsappUrl = buildSimularGratisWhatsAppUrl()
  const founderPhoto = useRevealClasses<HTMLDivElement>('left', 0)
  const founderCopy = useRevealClasses<HTMLDivElement>('right', 80)
  const experienceHeader = useRevealClasses<HTMLDivElement>('up', 0)
  const formationHeader = useRevealClasses<HTMLDivElement>('up', 0)
  const platformHeader = useRevealClasses<HTMLDivElement>('up', 0)
  const closingBlock = useRevealClasses<HTMLDivElement>('up', 0)

  return (
    <div className="product-landing">
      <section className="product-landing__hero">
        <div className="product-landing__hero-inner">
          <a href="/" className="product-landing__hero-brand" aria-label="Teu Posto, voltar ao login">
            <img src="/imagens/logo_teuposto_white.png" alt="Teu Posto" />
          </a>
          <p className="product-landing__eyebrow">Menos papel, mais eficiência</p>
          <h1>Gestão completa para postos de combustível, com conformidade e transparência</h1>
          <p className="product-landing__hero-lead">
            O <strong>Teu Posto</strong> simplifica processos regulatórios, operacionais e de
            conformidade, do RAQ à metrologia, da segurança do trabalho ao controle ambiental.
            Disponível em todo o Brasil e, em breve, em toda a América Latina.
          </p>
          <div className="product-landing__hero-actions">
            <a href={whatsappUrl} className="product-landing__btn product-landing__btn--whatsapp" target="_blank" rel="noopener noreferrer">
              Simular grátis
            </a>
            <a href="/" className="product-landing__btn product-landing__btn--primary">
              Acessar o sistema
            </a>
          </div>
        </div>
      </section>

      <section id="quem-esta-por-tras" className="product-landing__founder">
        <div className="product-landing__container product-landing__founder-grid">
          <div
            ref={founderPhoto.ref}
            className={`product-landing__founder-media ${founderPhoto.className}`}
            style={founderPhoto.style}
          >
            <img
              src="/imagens/ilto-filho.png"
              alt="Ilto Filho, especialista em petróleo, gás e biocombustíveis"
              className="product-landing__founder-photo"
            />
          </div>
          <div
            ref={founderCopy.ref}
            className={`product-landing__founder-copy ${founderCopy.className}`}
            style={founderCopy.style}
          >
            <p className="product-landing__section-label">Quem está por trás</p>
            <h2>Ilto Filho</h2>
            <p className="product-landing__founder-role">
              Especialista em Petróleo, Gás e Biocombustíveis. Engenharia e Gestão.
            </p>
            <p>
              Há mais de 27 anos no segmento de energia, combustíveis e biocombustíveis, com atuação
              de destaque no Brasil e no Uruguai. Passagens por instituições de referência do setor e
              foco em gestão operacional, conformidade regulatória, metrologia legal e segurança,
              sempre com o posto revendedor no centro da solução.
            </p>
            <p>
              Essa experiência orientou o desenvolvimento do Teu Posto: uma plataforma pensada por
              quem já atendeu mais de <strong>2.300 postos</strong> e conhece a rotina real do
              revendedor.
            </p>
          </div>
        </div>
      </section>

      <ProductAboutStats />

      <section className="product-landing__experience">
        <div className="product-landing__container">
          <div ref={experienceHeader.ref} className={experienceHeader.className} style={experienceHeader.style}>
            <p className="product-landing__section-label">Trajetória</p>
            <h2>Referência técnica em combustíveis e conformidade</h2>
          </div>
          <div className="product-landing__cards">
            {EXPERIENCE.map((item, index) => (
              <ExperienceCard key={item.title} item={item} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="product-landing__formation">
        <div className="product-landing__container">
          <div ref={formationHeader.ref} className={formationHeader.className} style={formationHeader.style}>
            <p className="product-landing__section-label">Formação</p>
            <h2>Engenharia, gestão e especializações que sustentam o produto</h2>
          </div>
          <ul className="product-landing__chips">
            {FORMATION.map((item, index) => (
              <FormationChip key={item} label={item} index={index} />
            ))}
          </ul>
        </div>
      </section>

      <section id="plataforma" className="product-landing__platform">
        <div className="product-landing__container">
          <div ref={platformHeader.ref} className={platformHeader.className} style={platformHeader.style}>
            <p className="product-landing__section-label">A plataforma</p>
            <h2>Teu Posto: módulos integrados para o dia a dia do posto</h2>
            <p className="product-landing__platform-intro">
              Desenvolvida para revolucionar a gestão de postos revendedores, reunindo em um só ambiente
              o que antes dependia de planilhas, pastas e controles paralelos.
            </p>
          </div>
          <div className="product-landing__modules">
            {PLATFORM_MODULES.map((module, index) => (
              <PlatformModule key={module.title} module={module} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="product-landing__closing">
        <LandingBackdrop variant="cta" />
        <div
          ref={closingBlock.ref}
          className={`product-landing__container product-landing__closing-inner ${closingBlock.className}`}
          style={closingBlock.style}
        >
          <h2>Pronto para conhecer na prática?</h2>
          <p>
            Simule gratuitamente com nossa equipe ou entre no sistema se você já é cliente Teu Posto.
          </p>
          <div className="product-landing__hero-actions">
            <a href={whatsappUrl} className="product-landing__btn product-landing__btn--whatsapp" target="_blank" rel="noopener noreferrer">
              Simular grátis no WhatsApp
            </a>
            <a href="/" className="product-landing__btn product-landing__btn--ghost">
              Voltar ao login
            </a>
          </div>
        </div>
      </section>

      <footer className="product-landing__footer">
        <LandingBackdrop variant="footer" />
        <div className="product-landing__container product-landing__footer-inner">
          <img src="/imagens/logo_teuposto_white.png" alt="" className="product-landing__footer-logo" />
          <p>Teu Posto. Gestão e conformidade para revendedores de combustíveis.</p>
        </div>
      </footer>
    </div>
  )
}
