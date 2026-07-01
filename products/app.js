let total = 0;

function toggleItem(button, price) {
    if (button.innerText === "Add") {
        total += price;
        button.innerText = "Remove";
    } else {
        total -= price;
        button.innerText = "Add";
    }

    document.getElementById("total").innerText = total;
}