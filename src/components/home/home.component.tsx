import React from 'react';
import './home.component.css';
import icon from './../../assets/icon.png';

const Home = () => {
  return (
    <section className="app-thesis">
      <h4>Your perfect journey with AI-powered travel starts here</h4>
      <div className="image-container">
        <img src={icon} alt="" />
      </div>
    </section >
  );
};

export default Home;