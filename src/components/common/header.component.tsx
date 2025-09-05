import React from 'react';
import './header.component.css';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="full-width-header">
      <div className="header-container">
        <div className="header-logo">
          <h2>Plainer</h2>
        </div>

        <nav className="header-nav">
          <Link to="/">Home</Link>
          <Link to="/policy">Policy</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;