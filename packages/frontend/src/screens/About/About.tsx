import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import styles from './About.module.css';

export default function About(): React.JSX.Element {
  return (
    <>
      <Header isStravaConnected={false} />

      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>About Segment Attestations</h1>

          <section className={styles.section}>
            <h2>What is this?</h2>
            <p>
              Segment Attestations allows you to create verifiable, onchain attestations for Strava
              segments you've completed. Using the{' '}
              <a href="https://ver.ax" target="_blank" rel="noopener noreferrer">
                Verax protocol
              </a>{' '}
              on Linea, your athletic achievements become cryptographically provable.
            </p>
          </section>

          <section className={styles.section}>
            <h2>How does it work?</h2>
            <ol className={styles.steps}>
              <li>
                <strong>Connect your Strava account</strong> – We use OAuth to securely access your
                activities and segments.
              </li>
              <li>
                <strong>Select a segment</strong> – Browse your recent activities and pick a segment
                you've completed.
              </li>
              <li>
                <strong>Create an attestation</strong> – Our backend verifies you actually completed
                the segment, then signs the data.
              </li>
              <li>
                <strong>Submit onchain</strong> – The attestation is recorded on Linea using Verax,
                creating a permanent proof.
              </li>
            </ol>
          </section>

          <section className={styles.section}>
            <h2>Why attestations?</h2>
            <p>
              Unlike NFTs, attestations are lightweight, standardized proofs that can be easily
              verified by other applications. They're perfect for:
            </p>
            <ul className={styles.list}>
              <li>Proving your athletic achievements</li>
              <li>Building a verifiable fitness portfolio</li>
              <li>Qualifying for events or challenges</li>
              <li>Showcasing your dedication to training</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Technology</h2>
            <p>Built with:</p>
            <ul className={styles.list}>
              <li>
                <strong>Verax</strong> – Attestation protocol for structured onchain data
              </li>
              <li>
                <strong>Linea</strong> – Ethereum L2 with low transaction costs
              </li>
              <li>
                <strong>Strava API</strong> – For accessing your activities and segments
              </li>
              <li>
                <strong>EIP-712 signatures</strong> – For secure, verifiable attestation data
              </li>
            </ul>
          </section>

          <div className={styles.cta}>
            <Link to="/" className={styles.button}>
              Get Started
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
