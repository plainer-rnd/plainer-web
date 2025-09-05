import React from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import './App.css';
import Home from './components/home/home.component';
import Header from './components/common/header.component';
import Policy from './components/policy/policy.component';
import Contact from './components/contact/contact.component';


function App() {
  return (
    <Router>
      <div className="app">
        <Header />
        <div className="screen-area">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/policy" element={<Policy />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;


