const header = document.querySelector(".hero-header");

window.addEventListener("scroll", () => {

    if(window.scrollY > 300){
        header.classList.add("scrolled");
    }else{
        header.classList.remove("scrolled");
    }

});


const slides = document.querySelectorAll(".slide");

const heroTitle = document.getElementById("hero-title");
const heroDescription = document.getElementById("hero-description");

const nextBtn = document.querySelector(".next-btn");
const prevBtn = document.querySelector(".prev-btn");

const heroData = [

{
  title: "Suvenirs hechos para emocionar",
  description: "Arreglos y velas aromaticas diseñados para convertir cualquier ocasión en un recuerdo inolvidable."
},

{
  title: "Tu esencia, en cada rincón",
  description: "Home sprays diseñados para llenar tu hogar de frescura, armonía y personalidad."
},

{
  title: "Detalles únicos para ocasiones inolvidables",
  description: "Cada pieza se elabora bajo pedido para reflejar el cariño detrás de cada regalo."
},

{
  title: "Regalos que cuentan historias",
  description: "Detalles únicos elaborados para sorprender en fechas y momentos que merecen ser recordados."
},

{
  title: "Flores, aroma y emoción en un solo regalo",
  description: "Detalles artesanales creados para convertir cualquier momento en un recuerdo especial."
}

];

let current = 0;
let autoSlideStopped = false;

function updateSlide(){

    slides.forEach(slide => {
        slide.classList.remove("active");
    });

    slides[current].classList.add("active");

    heroTitle.textContent = heroData[current].title;
    heroDescription.textContent = heroData[current].description;
}

const autoSlide = setInterval(() => {

    current++;

    if(current >= slides.length){
        current = 0;
    }

    updateSlide();

}, 7000);

function stopAutoSlide(){

    if(!autoSlideStopped){
        clearInterval(autoSlide);
        autoSlideStopped = true;
    }

}

nextBtn.addEventListener("click", () => {

    stopAutoSlide();

    current++;

    if(current >= slides.length){
        current = 0;
    }

    updateSlide();
});

prevBtn.addEventListener("click", () => {

    stopAutoSlide();

    current--;

    if(current < 0){
        current = slides.length - 1;
    }

    updateSlide();
});

new Swiper(".products-slider", {

    loop: true,

    slidesPerView: 3,

    spaceBetween: 30,

    navigation: {
        nextEl: ".next-product",
        prevEl: ".prev-product"
    }

});

const menuBtn =
document.querySelector(".mobile-menu-btn");

const mobileMenu =
document.querySelector(".mobile-menu");

const overlay =
document.querySelector(".mobile-overlay");

const icon =
menuBtn.querySelector("i");

function closeMenu(){

    mobileMenu.classList.remove("active");

    overlay.classList.remove("active");

    menuBtn.classList.remove("active");

    document.body.classList.remove("menu-open");

    icon.classList.remove("fa-xmark");
    icon.classList.add("fa-bars");
}

menuBtn.addEventListener("click", () => {

    mobileMenu.classList.toggle("active");

    overlay.classList.toggle("active");

    document.body.classList.toggle("menu-open");

    menuBtn.classList.toggle("active");

    if(mobileMenu.classList.contains("active")){

        icon.classList.remove("fa-bars");
        icon.classList.add("fa-xmark");

    }else{

        icon.classList.remove("fa-xmark");
        icon.classList.add("fa-bars");

    }

});

overlay.addEventListener("click", closeMenu);

const mobileLinks =
document.querySelectorAll(".mobile-menu a");

mobileLinks.forEach(link => {

    link.addEventListener("click", closeMenu);

});


AOS.init({
    duration: 800,
    once: true
});