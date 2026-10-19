import type { Metadata } from 'next';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CircleDollarSign,
  Cpu,
  Dna,
  MessageCircle,
  ScanLine,
} from 'lucide-react';
import styles from './servicios.module.css';

export const metadata: Metadata = {
  title: 'Servicios | RB SmartFarm',
  description: 'Soluciones de ganadería inteligente de Sistema Ramiro Barrera.',
};

const whatsappUrl =
  'https://wa.me/573123526465?text=Hola%20Ramiro%2C%20quiero%20conocer%20los%20servicios%20de%20RB%20SmartFarm.';

const services = [
  {
    icon: Dna,
    title: 'Reproducción inteligente',
    description: 'Ciclos, servicios, diagnósticos, gestaciones y alertas para actuar a tiempo.',
    tag: 'Control reproductivo',
  },
  {
    icon: BarChart3,
    title: 'Administración ganadera',
    description: 'Información organizada para hacer seguimiento y tomar decisiones más rentables.',
    tag: 'Indicadores claros',
  },
  {
    icon: ScanLine,
    title: 'Tecnología y trazabilidad',
    description: 'Animales identificados, registros conectados y datos que se convierten en acción.',
    tag: 'Datos confiables',
  },
  {
    icon: CircleDollarSign,
    title: 'Soluciones para búfalos',
    description: 'Acompañamiento técnico adaptado a los retos y oportunidades de su producción.',
    tag: 'Enfoque especializado',
  },
  {
    icon: BookOpenCheck,
    title: 'Formación y acompañamiento',
    description: 'Capacitación práctica para que el equipo implemente mejoras que perduren.',
    tag: 'Conocimiento aplicado',
  },
];

export default function ServiciosPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <nav className={styles.nav} aria-label="Navegación de servicios">
          <a className={styles.brand} href="/" aria-label="Ir a RB SmartFarm">
            <span className={styles.brandMark}>RB</span>
            <span>
              <strong>RAMIRO BARRERA</strong>
              <small>GANADERÍA INTELIGENTE</small>
            </span>
          </a>
          <a className={styles.navLink} href={whatsappUrl} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" /> Hablar por WhatsApp
          </a>
        </nav>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>SISTEMA RAMIRO BARRERA · RB SMARTFARM</p>
          <h1>Gestione mejor.<br /><em>Decida a tiempo.</em></h1>
          <p className={styles.lede}>
            Información técnica organizada para convertir los datos de su finca en decisiones rentables.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#servicios">
              Conozca los servicios <ArrowRight size={20} aria-hidden="true" />
            </a>
            <a className={styles.secondaryButton} href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={20} aria-hidden="true" /> +57 312 352 6465
            </a>
          </div>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <img src="/brand/identidad-visual.png" alt="" />
        </div>
      </section>

      <section className={styles.services} id="servicios">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>SOLUCIONES PARA SU FINCA</p>
          <h2>¿Qué necesita hoy?</h2>
          <p>Elija una ruta y conversemos sobre la realidad de su producción.</p>
        </div>
        <div className={styles.grid}>
          {services.map(({ icon: Icon, title, description, tag }) => (
            <article className={styles.card} key={title}>
              <div className={styles.icon}><Icon size={29} strokeWidth={1.8} aria-hidden="true" /></div>
              <p className={styles.tag}>{tag}</p>
              <h3>{title}</h3>
              <p>{description}</p>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Solicitar orientación <ArrowRight size={17} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.contact}>
        <div>
          <p className={styles.eyebrow}>PRIMER PASO</p>
          <h2>Cuéntenos sobre su finca.</h2>
          <p>Un mensaje es suficiente para empezar una conversación técnica y aterrizada.</p>
        </div>
        <a className={styles.contactButton} href={whatsappUrl} target="_blank" rel="noreferrer">
          <MessageCircle size={22} aria-hidden="true" /> Escribir por WhatsApp
        </a>
      </section>

      <footer className={styles.footer}>
        <span>RB SMARTFARM · GANADERÍA INTELIGENTE</span>
        <span>Más datos. Mejores decisiones. Mayor rentabilidad.</span>
      </footer>
    </main>
  );
}
